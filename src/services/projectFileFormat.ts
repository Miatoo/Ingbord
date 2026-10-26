import { Project } from '../types';

export const PROJECT_FILE_EXT = '.clapboard';
export const PROJECT_FORMAT_ID = 'clapboard-project';
export const PROJECT_FORMAT_VERSION = 1;

export interface ClapboardProjectFile {
  format: typeof PROJECT_FORMAT_ID;
  version: number;
  exportedAt: number;
  project: Project;
}

export function isClapboardProjectFile(data: unknown): data is ClapboardProjectFile {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (obj.format !== PROJECT_FORMAT_ID) return false;
  const project = obj.project;
  return !!project && typeof project === 'object' && Array.isArray((project as Project).shots);
}

export function serializeProjectFile(project: Project): string {
  const payload: ClapboardProjectFile = {
    format: PROJECT_FORMAT_ID,
    version: PROJECT_FORMAT_VERSION,
    exportedAt: Date.now(),
    project,
  };
  return JSON.stringify(payload, null, 2);
}

/** 解析 .clapboard / 旧版 JSON 工程；兼容完整 Project 或导出的 { project, shots } */
export function parseProjectFile(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('INVALID_PROJECT_FILE');
  }

  if (isClapboardProjectFile(data)) {
    return data.project;
  }

  // 旧版完整工程（直接是 Project）
  if (data && typeof data === 'object' && Array.isArray((data as Project).shots)) {
    return data as Project;
  }

  // 旧版「导出分镜表」精简 JSON：{ project, shots }
  if (data && typeof data === 'object') {
    const wrap = data as {
      project?: Partial<Project> & { name?: string };
      shots?: Array<Record<string, unknown>>;
    };
    if (wrap.project && Array.isArray(wrap.shots)) {
      const now = Date.now();
      const shots = wrap.shots.map((shot, index) => ({
        id: String(shot.id || `imported-${index}-${now}`),
        shotNumber: String(shot.shotNumber ?? index + 1),
        order: typeof shot.order === 'number' ? shot.order : index,
        framing: (shot.framing as Project['shots'][0]['framing']) || 'MS',
        cameraAngle: (shot.cameraAngle as Project['shots'][0]['cameraAngle']) || 'eye',
        shotType: (shot.shotType as Project['shots'][0]['shotType']) || 'static',
        duration: typeof shot.duration === 'number' ? shot.duration : 3,
        notes: String(shot.notes || ''),
        image: String(shot.imageUrl || shot.image || ''),
        imageSource: 'upload' as const,
        createdAt: now,
        updatedAt: now,
      }));
      return {
        id: wrap.project.id || `imported-${now}`,
        name: wrap.project.name || '导入的项目',
        shots,
        aspectRatio: wrap.project.aspectRatio || '16:9',
        pdfHeaderText: wrap.project.pdfHeaderText,
        pdfColumns: wrap.project.pdfColumns,
        pdfRows: wrap.project.pdfRows,
        pdfPageWidthMm: wrap.project.pdfPageWidthMm,
        pdfPageHeightMm: wrap.project.pdfPageHeightMm,
        createdAt: wrap.project.createdAt || now,
        updatedAt: now,
      };
    }
  }

  throw new Error('INVALID_PROJECT_FILE');
}

export function safeProjectFileName(name: string): string {
  const cleaned = (name || '未命名项目').replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || '未命名项目';
}

export function getDesktopApi() {
  return typeof window !== 'undefined' ? window.clapboardDesktop : undefined;
}
