import { create } from 'zustand';
import { Project, Shot, ImageVersion } from '../types';
import { cropToSafeFrame } from '../utils/imageUtils';
import { saveProjectToLocalSync } from '../services/projectService';
import { createId } from '../utils/id';
import {
  buildShotGroups,
  insertDuplicateAfterSource,
  moveShotGroups,
  nextMainNumberFromLast,
  normalizeShotRelationships,
  renumberByGroups,
  unbindShotFromParent,
} from '../utils/shotNumbering';

interface ProjectStore {
  project: Project | null;
  
  // Actions
  initProject: (name?: string) => void;
  setProjectFromServer: (project: Project) => void;
  importProject: (importData: {
    project: {
      name?: string;
      aspectRatio?: string;
      pdfHeaderText?: string;
      pdfColumns?: number;
      pdfRows?: number;
      pdfPageWidthMm?: number;
      pdfPageHeightMm?: number;
      createdAt?: number;
    };
    shots: Array<{
      shotNumber?: string;
      order?: number;
      framing?: string;
      cameraAngle?: string;
      shotType?: string;
      duration?: number;
      notes?: string;
      imageUrl?: string;
      parentShotId?: string;
    }>;
  }) => Promise<void>;
  updateProjectName: (name: string) => void;
  // 这里接受更宽松的字符串，方便扩展更多画幅比例
  updateProjectAspectRatio: (aspectRatio: string) => void;
  updatePdfHeaderText: (text: string) => void;
  updatePdfLayout: (layout: {
    pdfColumns?: number;
    pdfRows?: number;
    pdfPageWidthMm?: number;
    pdfPageHeightMm?: number;
  }) => void;
  
  // Shot CRUD
  createShot: () => string; // 返回新创建的 shot id
  updateShot: (shotId: string, updates: Partial<Shot>) => void;
  deleteShot: (shotId: string) => void;
  duplicateShot: (shotId: string) => string; // 返回新复制的 shot id
  /** 按拖拽的 active/over 成组重排 */
  reorderShotsByDrag: (activeId: string, overId: string) => void;
  reorderShots: (shotIds: string[]) => void;
  /** 解绑复制镜头，使其成为独立主镜头 */
  unbindShot: (shotId: string) => void;
  
  // Getters
  getShot: (shotId: string) => Shot | undefined;
  getShotsSorted: () => Shot[];
  
  // Image Version Management
  addImageVersion: (shotId: string, version: ImageVersion) => void;
  setActiveImageVersion: (shotId: string, versionId: string) => void;
  getActiveImageVersion: (shotId: string) => ImageVersion | null;
}

const createDefaultShot = (order: number, shotNumber: string): Shot => {
  const id = createId();
  return {
    id,
    shotNumber,
    order,
    framing: 'MS',
    cameraAngle: 'eye',
    shotType: 'static',
    duration: 3.0,
    image: '', // 占位图
    notes: '',
    imageSource: 'placeholder',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

const withNormalizedShots = (project: Project): Project => ({
  ...project,
  shots: normalizeShotRelationships(project.shots || []),
});

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: null,
  
  initProject: (name = '未命名项目') => {
    const project: Project = {
      id: createId(),
      name,
      shots: [],
      aspectRatio: '16:9',
      pdfHeaderText: '第 {page} 页',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set({ project });
    // 立即写入本机缓存，保证新建工程后刷新仍是新工程进度
    try {
      saveProjectToLocalSync(project);
    } catch {
      // ignore
    }
  },
  
  setProjectFromServer: (project: Project) => {
    set({ project: withNormalizedShots(project) });
  },
  
  importProject: async (importData) => {
    const now = Date.now();
    
    // 创建新项目
    const project: Project = {
      id: createId(),
      name: importData.project.name || '导入的项目',
      aspectRatio: importData.project.aspectRatio || '16:9',
      pdfHeaderText: importData.project.pdfHeaderText || '第 {page} 页',
      pdfColumns: importData.project.pdfColumns,
      pdfRows: importData.project.pdfRows,
      pdfPageWidthMm: importData.project.pdfPageWidthMm,
      pdfPageHeightMm: importData.project.pdfPageHeightMm,
      createdAt: importData.project.createdAt || now,
      updatedAt: now,
      shots: [],
    };
    
    const aspectRatio = project.aspectRatio;
    
    // 导入 shots，并裁剪图片到安全框内
    const shots: Shot[] = await Promise.all(
      (importData.shots || []).map(async (importShot, index) => {
        let image = importShot.imageUrl || '';
        
        // 如果有图片且项目有aspectRatio，裁剪到安全框内
        if (image && aspectRatio) {
          try {
            image = await cropToSafeFrame(image, aspectRatio);
          } catch (error) {
            console.error('裁剪导入图片失败:', error);
            // 如果裁剪失败，使用原图
          }
        }
        
        const shot: Shot = {
          id: createId(),
          shotNumber: importShot.shotNumber || String(index + 1),
          order: importShot.order !== undefined ? importShot.order : index,
          parentShotId: importShot.parentShotId,
          framing: (importShot.framing as any) || 'MS',
          cameraAngle: (importShot.cameraAngle as any) || 'eye',
          shotType: (importShot.shotType as any) || 'static',
          duration: importShot.duration || 3.0,
          notes: importShot.notes || '',
          image,
          imageSource: importShot.imageUrl ? 'drawing' : 'placeholder',
          createdAt: now,
          updatedAt: now,
        };
        return shot;
      })
    );
    
    // 按 order 排序，并推断复制关系
    shots.sort((a, b) => a.order - b.order);
    project.shots = normalizeShotRelationships(shots);
    set({ project });
  },
  
  updateProjectName: (name: string) => {
    const { project } = get();
    if (project) {
      set({
        project: {
          ...project,
          name,
          updatedAt: Date.now(),
        },
      });
    }
  },
  
  updateProjectAspectRatio: (aspectRatio: string) => {
    const { project } = get();
    if (project) {
      set({
        project: {
          ...project,
          // 允许存储更多自定义/扩展比例
          aspectRatio: aspectRatio as any,
          updatedAt: Date.now(),
        },
      });
    }
  },
  
  updatePdfHeaderText: (text: string) => {
    const { project } = get();
    if (project) {
      set({
        project: {
          ...project,
          pdfHeaderText: text,
          updatedAt: Date.now(),
        },
      });
    }
  },

  updatePdfLayout: (layout) => {
    const { project } = get();
    if (!project) return;
    const clampCount = (value: number | undefined, fallback: number) => {
      if (value == null || Number.isNaN(value)) return fallback;
      return Math.min(12, Math.max(1, Math.round(value)));
    };
    const clampMm = (value: number | undefined, fallback: number) => {
      if (value == null || Number.isNaN(value)) return fallback;
      return Math.min(2000, Math.max(50, Math.round(value)));
    };
    set({
      project: {
        ...project,
        pdfColumns: clampCount(layout.pdfColumns, project.pdfColumns || 4),
        pdfRows: clampCount(layout.pdfRows, project.pdfRows || 3),
        pdfPageWidthMm: clampMm(layout.pdfPageWidthMm, project.pdfPageWidthMm || 297),
        pdfPageHeightMm: clampMm(layout.pdfPageHeightMm, project.pdfPageHeightMm || 210),
        updatedAt: Date.now(),
      },
    });
  },
  
  createShot: () => {
    let { project } = get();
    // 局域网 http 访问时，若初始化未完成或失败，先补建项目
    if (!project) {
      get().initProject();
      project = get().project;
    }
    if (!project) return '';

    const shots = normalizeShotRelationships(project.shots);
    const nextMain = nextMainNumberFromLast(shots);
    const nextOrder =
      shots.length === 0
        ? 0
        : Math.max(...shots.map((s) => s.order)) + 1;
    const newShot = createDefaultShot(nextOrder, String(nextMain));
    const updatedProject = {
      ...project,
      shots: [...shots, newShot],
      updatedAt: Date.now(),
    };
    set({ project: updatedProject });
    return newShot.id;
  },
  
  updateShot: (shotId: string, updates: Partial<Shot>) => {
    const { project } = get();
    if (!project) return;
    
    const updatedShots = project.shots.map((shot) =>
      shot.id === shotId
        ? { ...shot, ...updates, updatedAt: Date.now() }
        : shot
    );
    
    set({
      project: {
        ...project,
        shots: updatedShots,
        updatedAt: Date.now(),
      },
    });
  },
  
  deleteShot: (shotId: string) => {
    const { project } = get();
    if (!project) return;

    const normalized = normalizeShotRelationships(project.shots);
    let remaining = normalized.filter((shot) => shot.id !== shotId);

    // 删除主镜头时：组内下一镜升为新主镜头，其余仍挂在新主镜头下
    const orphans = remaining
      .filter((shot) => shot.parentShotId === shotId)
      .sort((a, b) => a.order - b.order);
    if (orphans.length > 0) {
      const newMainId = orphans[0].id;
      remaining = remaining.map((shot) => {
        if (shot.id === newMainId) {
          return { ...shot, parentShotId: undefined };
        }
        if (shot.parentShotId === shotId) {
          return { ...shot, parentShotId: newMainId };
        }
        return shot;
      });
    }

    const renumbered = renumberByGroups(buildShotGroups(remaining));
    
    set({
      project: {
        ...project,
        shots: renumbered,
        updatedAt: Date.now(),
      },
    });
  },
  
  duplicateShot: (shotId: string) => {
    const { project } = get();
    if (!project) return '';
    const sourceShot = project.shots.find((s) => s.id === shotId);
    if (!sourceShot) return '';

    const newId = createId();
    const now = Date.now();
    const { shots, newShotId } = insertDuplicateAfterSource(
      project.shots,
      shotId,
      {
        ...sourceShot,
        id: newId,
        createdAt: now,
        updatedAt: now,
      }
    );
    if (!newShotId) return '';
    
    set({
      project: {
        ...project,
        shots,
        updatedAt: now,
      },
    });
    return newShotId;
  },

  reorderShotsByDrag: (activeId: string, overId: string) => {
    const { project } = get();
    if (!project || activeId === overId) return;

    const normalized = normalizeShotRelationships(project.shots);
    const reordered = moveShotGroups(normalized, activeId, overId);

    set({
      project: {
        ...project,
        shots: reordered,
        updatedAt: Date.now(),
      },
    });
  },
  
  reorderShots: (shotIds: string[]) => {
    const { project } = get();
    if (!project) return;
    
    const shotMap = new Map(
      normalizeShotRelationships(project.shots).map((shot) => [shot.id, shot])
    );
    const ordered = shotIds
      .map((id) => shotMap.get(id))
      .filter((shot): shot is Shot => !!shot)
      .map((shot, index) => ({ ...shot, order: index }));

    // 按新顺序重建组并重排主序号（1、1b、2…）
    const renumbered = renumberByGroups(buildShotGroups(ordered));
    
    set({
      project: {
        ...project,
        shots: renumbered,
        updatedAt: Date.now(),
      },
    });
  },

  unbindShot: (shotId: string) => {
    const { project } = get();
    if (!project) return;

    const shots = unbindShotFromParent(project.shots, shotId);
    set({
      project: {
        ...project,
        shots,
        updatedAt: Date.now(),
      },
    });
  },
  
  getShot: (shotId: string) => {
    const { project } = get();
    return project?.shots.find((s) => s.id === shotId);
  },
  
  getShotsSorted: () => {
    const { project } = get();
    if (!project) return [];
    return [...project.shots].sort((a, b) => a.order - b.order);
  },
  
  addImageVersion: (shotId: string, version: ImageVersion) => {
    const { project } = get();
    if (!project) return;
    
    const updatedShots = project.shots.map((shot) => {
      if (shot.id === shotId) {
        const versions = shot.imageVersions || [];
        const originalVersion: ImageVersion = {
          id: createId(),
          image: shot.image,
          source: 'original',
          createdAt: shot.createdAt,
        };
        
        // 如果还没有原图版本，先添加原图版本
        const hasOriginal = versions.some(v => v.source === 'original');
        const allVersions = hasOriginal ? versions : [originalVersion, ...versions];
        
        // 添加新版本
        const newVersions = [...allVersions, version];
        
        // 设置新版本为激活版本，并更新shot.image
        return {
          ...shot,
          imageVersions: newVersions,
          activeVersionId: version.id,
          image: version.image, // 更新当前显示的图片
          updatedAt: Date.now(),
        };
      }
      return shot;
    });
    
    const updatedProject: Project = {
      ...project,
      shots: updatedShots,
      updatedAt: Date.now(),
    };

    set({ project: updatedProject });

    // 立即同步写入本地缓存，确保AI生图版本在刷新后仍能保留
    try {
      saveProjectToLocalSync(updatedProject);
    } catch {
      // 忽略本地缓存写入错误（例如空间不足）
    }
  },
  
  setActiveImageVersion: (shotId: string, versionId: string) => {
    const { project } = get();
    if (!project) return;
    
    const updatedShots = project.shots.map((shot) => {
      if (shot.id === shotId) {
        const versions = shot.imageVersions || [];
        const version = versions.find(v => v.id === versionId);
        if (version) {
          return {
            ...shot,
            activeVersionId: versionId,
            image: version.image, // 更新当前显示的图片
            updatedAt: Date.now(),
          };
        }
      }
      return shot;
    });
    
    const updatedProject: Project = {
      ...project,
      shots: updatedShots,
      updatedAt: Date.now(),
    };

    set({ project: updatedProject });

    // 同步更新本地缓存，保证当前激活版本在刷新后恢复
    try {
      saveProjectToLocalSync(updatedProject);
    } catch {
      // 忽略本地缓存写入错误
    }
  },
  
  getActiveImageVersion: (shotId: string) => {
    const { project } = get();
    if (!project) return null;
    
    const shot = project.shots.find(s => s.id === shotId);
    if (!shot || !shot.imageVersions || shot.imageVersions.length === 0) {
      return null;
    }
    
    if (shot.activeVersionId) {
      return shot.imageVersions.find(v => v.id === shot.activeVersionId) || null;
    }
    
    // 如果没有指定激活版本，返回第一个版本
    return shot.imageVersions[0] || null;
  },
}));

