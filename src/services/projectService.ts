import { Project, Shot, ImageVersion } from '../types';
import { convertImageToBlob, imageToBase64 } from '../utils/imageUtils';
import {
  getDesktopApi,
  parseProjectFile,
  PROJECT_FILE_EXT,
  safeProjectFileName,
  serializeProjectFile,
} from './projectFileFormat';
import {
  getProjectExternalPath,
  setProjectExternalPath,
} from './projectPathStore';

/** 将 blob URL 转为 base64 data URL，便于持久化后刷新仍可显示 */
async function blobUrlToBase64(url: string): Promise<string> {
  if (!url || !url.startsWith('blob:')) return url;
  try {
    const blob = await convertImageToBlob(url);
    return await imageToBase64(blob, 'image/png');
  } catch {
    return url;
  }
}

/** 将项目中所有 blob URL（shot.image、imageVersions、annotations.baseImage）转为 base64，保证刷新后图片不丢失 */
export async function convertProjectBlobsToBase64(project: Project): Promise<Project> {
  const shots: Shot[] = await Promise.all(
    (project.shots || []).map(async (shot) => {
      let image = shot.image;
      if (image && image.startsWith('blob:')) {
        image = await blobUrlToBase64(image);
      }
      let imageVersions: ImageVersion[] | undefined = shot.imageVersions;
      if (imageVersions?.length) {
        imageVersions = await Promise.all(
          imageVersions.map(async (v) => {
            let img = v.image;
            if (img && img.startsWith('blob:')) {
              img = await blobUrlToBase64(img);
            }
            return { ...v, image: img };
          })
        );
      }
      let sourceParams = shot.sourceParams;
      const ann = shot.sourceParams?.annotations;
      if (ann?.baseImage && ann.baseImage.startsWith('blob:')) {
        const baseImage = await blobUrlToBase64(ann.baseImage);
        sourceParams = {
          ...shot.sourceParams,
          annotations: { ...ann, baseImage },
        };
      }
      return {
        ...shot,
        image,
        imageVersions,
        sourceParams,
      };
    })
  );
  return { ...project, shots };
}

/**
 * 为了适配 localStorage 容量限制，对项目做“精简”：
 * - 每个镜头：
 *   - 保留原图版本（source === 'original'）
 *   - 保留当前激活版本（activeVersionId）
 *   - 额外保留最多 2 个最新的 AI 版本
 * 这样在空间不足时，优先保证最近的 AI 生图版本能被持久化。
 */
function shrinkProjectForLocal(project: Project): Project {
  const shots: Shot[] = (project.shots || []).map((shot) => {
    const versions = shot.imageVersions;
    if (!versions || versions.length === 0) return shot;

    const byCreatedAtAsc = [...versions].sort((a, b) => a.createdAt - b.createdAt);

    const original = byCreatedAtAsc.find((v) => v.source === 'original') || null;
    const active = shot.activeVersionId
      ? byCreatedAtAsc.find((v) => v.id === shot.activeVersionId) || null
      : null;

    const latestAi = byCreatedAtAsc
      .filter((v) => v.source === 'ai_generated')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 2);

    const keepIds = new Set<string>();
    if (original) keepIds.add(original.id);
    if (active) keepIds.add(active.id);
    latestAi.forEach((v) => keepIds.add(v.id));

    const newVersions = byCreatedAtAsc.filter((v) => keepIds.has(v.id));

    return {
      ...shot,
      imageVersions: newVersions,
    };
  });

  return { ...project, shots };
}

// --- 本机缓存持久化（纯本地，无后端）---

const LOCAL_STORAGE_KEY = 'web_storyboard_project';

const IDB_DB_NAME = 'web_storyboard_db';
const IDB_DB_VERSION = 2;
const IDB_STORE_NAME = 'projects';
const IDB_PROJECT_KEY = 'current_project';
const IDB_LIBRARY_STORE = 'library';

export interface SavedProjectCard {
  id: string;
  name: string;
  updatedAt: number;
  shotCount: number;
  cover: string;
  /** 用户选择的外部工程文件路径（桌面端） */
  externalPath?: string;
}

interface LibraryRecord extends SavedProjectCard {
  project: Project;
}

let storagePersisted = false;

async function tryPersistStorage(): Promise<void> {
  if (storagePersisted) return;
  try {
    if (typeof navigator === 'undefined') return;
    if (!navigator.storage || !navigator.storage.persist) return;
    const persisted = await navigator.storage.persist();
    if (persisted) storagePersisted = true;
  } catch {
    // ignore
  }
}

function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('INDEXEDDB_NOT_SUPPORTED'));
      return;
    }
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(IDB_LIBRARY_STORE)) {
        db.createObjectStore(IDB_LIBRARY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
    };
  });
}

async function readProjectFromIndexedDB(): Promise<Project | null> {
  try {
    const db = await openProjectDb();
    return await new Promise<Project | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(IDB_PROJECT_KEY);
      req.onsuccess = () => {
        const result = req.result as Project | undefined | null;
        if (!result || typeof result !== 'object' || !Array.isArray((result as any).shots)) {
          resolve(null);
        } else {
          resolve(result as Project);
        }
      };
      req.onerror = () => {
        reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
      };
    });
  } catch {
    return null;
  }
}

async function writeProjectToIndexedDB(project: Project): Promise<void> {
  const db = await openProjectDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.put(project, IDB_PROJECT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_WRITE_FAILED'));
  });
}

/** 从本机缓存读取项目，优先从 IndexedDB 读取，失败时回退到 localStorage */
export async function loadProjectFromLocal(): Promise<Project | null> {
  // 1）优先尝试 IndexedDB（更大空间、持久化）
  const fromIdb = await readProjectFromIndexedDB();
  if (fromIdb) return fromIdb;

  // 2）回退到 localStorage（兼容旧版本数据）
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Project;
    if (!data || typeof data !== 'object' || !Array.isArray(data.shots)) return null;
    return data;
  } catch {
    return null;
  }
}

/** 保存项目到本机缓存（先转 blob 为 base64 再写入，保证刷新后图片可用） */
export async function saveProjectToLocal(project: Project): Promise<void> {
  if (!project) return;
  // 尝试申请持久化存储配额（如果浏览器支持）
  void tryPersistStorage();

  const toSave = await convertProjectBlobsToBase64(project);

  // 1）优先写入 IndexedDB（大容量、本地无感知）
  try {
    await writeProjectToIndexedDB(toSave);
    void upsertSavedProject(toSave);

    // 最佳努力：再写一份精简版到 localStorage，便于旧数据读取或快速恢复
    try {
      const slimForSync = shrinkProjectForLocal(toSave);
      const json = JSON.stringify(slimForSync);
      localStorage.setItem(LOCAL_STORAGE_KEY, json);
    } catch {
      // ignore
    }
    return;
  } catch (e) {
    if ((e as Error)?.name === 'QuotaExceededError') {
      console.warn('本地 IndexedDB 缓存已满，尝试精简项目后再保存（将保留原图和最近的 AI 版本）');
      try {
        const slim = shrinkProjectForLocal(toSave);
        await writeProjectToIndexedDB(slim);
        void upsertSavedProject(slim);
        console.warn('已精简项目并成功保存到 IndexedDB，本次可能丢弃了一些较早的 AI 生图版本。');
        // 标记一次，用于前端弹出提示（刷新后读取并清除）
        try {
          localStorage.setItem('web_storyboard_project_shrunk', '1');
        } catch {
          // ignore
        }
        return;
      } catch (e2) {
        if ((e2 as Error)?.name === 'QuotaExceededError') {
          console.warn('本地 IndexedDB 缓存仍然已满，无法保存项目');
        }
        // 继续尝试 localStorage 退路
      }
    } else {
      // 其他 IndexedDB 错误，降级回 localStorage
    }
  }

  // 2）IndexedDB 不可用或失败时，退回到原来的 localStorage 逻辑
  try {
    const json = JSON.stringify(toSave);
    localStorage.setItem(LOCAL_STORAGE_KEY, json);
  } catch (e) {
    if ((e as Error)?.name === 'QuotaExceededError') {
      console.warn('本地缓存已满，尝试精简项目后再保存（将保留原图和最近的 AI 版本）');
      try {
        const slim = shrinkProjectForLocal(toSave);
        const json = JSON.stringify(slim);
        localStorage.setItem(LOCAL_STORAGE_KEY, json);
        console.warn('已精简项目并成功保存到本地，本次可能丢弃了一些较早的 AI 生图版本。');
        // 标记一次，用于前端弹出提示（刷新后读取并清除）
        try {
          localStorage.setItem('web_storyboard_project_shrunk', '1');
        } catch {
          // ignore
        }
      } catch (e2) {
        if ((e2 as Error)?.name === 'QuotaExceededError') {
          console.warn('本地缓存仍然已满，无法保存项目');
        }
      }
    } else {
      throw e;
    }
  }
}

/** 同步写入当前项目到本机缓存（用于 beforeunload，不转 blob，尽量保留最后状态） */
export function saveProjectToLocalSync(project: Project): void {
  if (!project) return;
  try {
    const json = JSON.stringify(project);
    localStorage.setItem(LOCAL_STORAGE_KEY, json);
  } catch {
    // ignore
  }
  void upsertSavedProject(project);
}

function firstCoverSource(project: Project): string {
  const shots = [...(project.shots || [])].sort((a, b) => a.order - b.order);
  const withImage = shots.find((shot) => shot.image && shot.image.startsWith('data:image'));
  return withImage?.image || '';
}

function makeCoverThumbnail(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image')) return Promise.resolve('');
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = 360;
      const height = Math.max(1, Math.round(width * (img.height / Math.max(1, img.width))));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('');
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}

async function readLibraryRecords(): Promise<LibraryRecord[]> {
  const db = await openProjectDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_LIBRARY_STORE, 'readonly');
    const store = tx.objectStore(IDB_LIBRARY_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as LibraryRecord[];
      resolve(rows.filter((row) => row && row.project && Array.isArray(row.project.shots)));
    };
    req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
  });
}

async function resolveCover(project: Project): Promise<string> {
  let cover = await makeCoverThumbnail(firstCoverSource(project));
  if (cover) return cover;
  try {
    const db = await openProjectDb();
    const existing = await new Promise<LibraryRecord | null>((resolve) => {
      const tx = db.transaction(IDB_LIBRARY_STORE, 'readonly');
      const req = tx.objectStore(IDB_LIBRARY_STORE).get(project.id);
      req.onsuccess = () => resolve((req.result as LibraryRecord) || null);
      req.onerror = () => resolve(null);
    });
    return existing?.cover || '';
  } catch {
    return '';
  }
}

/** 桌面端：写入独立磁盘项目库（userData），并同步到用户选择的外部工程文件 */
async function upsertDesktopLibrary(project: Project): Promise<boolean> {
  const desktop = getDesktopApi();
  if (!desktop) return false;
  const cover = await resolveCover(project);
  const externalPath = getProjectExternalPath(project.id) || '';
  await desktop.upsertLibrary({
    id: project.id,
    name: project.name || '未命名项目',
    updatedAt: project.updatedAt || Date.now(),
    shotCount: project.shots?.length || 0,
    cover,
    externalPath,
    projectJson: serializeProjectFile(project),
  });
  return true;
}

/** 把当前工程写入本地项目库（封面 + 标题 + 完整工程） */
export async function upsertSavedProject(project: Project): Promise<void> {
  if (!project?.id) return;
  try {
    if (await upsertDesktopLibrary(project)) return;

    const cover = await resolveCover(project);
    const record: LibraryRecord = {
      id: project.id,
      name: project.name || '未命名项目',
      updatedAt: project.updatedAt || Date.now(),
      shotCount: project.shots?.length || 0,
      cover,
      project,
    };
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_LIBRARY_STORE, 'readwrite');
      const store = tx.objectStore(IDB_LIBRARY_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_WRITE_FAILED'));
    });
  } catch {
    // 项目库写入失败时，单工程缓存仍可用
  }
}

/** 列出已保存项目，按最近修改排序。空库时把旧的单工程缓存迁入。 */
export async function listSavedProjects(): Promise<SavedProjectCard[]> {
  const desktop = getDesktopApi();
  if (desktop) {
    try {
      let rows = await desktop.listLibrary();
      if (rows.length === 0) {
        const legacy = await loadProjectFromLocal();
        if (legacy) {
          await upsertSavedProject(legacy);
          rows = await desktop.listLibrary();
        }
      }
      // 顺带把 IndexedDB 旧库迁到磁盘库（一次性）
      try {
        const idbRows = await readLibraryRecords();
        for (const row of idbRows) {
          if (!rows.some((r) => r.id === row.id)) {
            if (row.project) await upsertSavedProject(row.project);
          }
        }
        if (idbRows.length) rows = await desktop.listLibrary();
      } catch {
        // ignore migration errors
      }
      return rows
        .map(({ id, name, updatedAt, shotCount, cover, externalPath }) => ({
          id,
          name,
          updatedAt,
          shotCount,
          cover,
          externalPath: externalPath || undefined,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      // fall through to IndexedDB
    }
  }

  try {
    let rows = await readLibraryRecords();
    if (rows.length === 0) {
      const legacy = await loadProjectFromLocal();
      if (legacy) {
        await upsertSavedProject(legacy);
        rows = await readLibraryRecords();
      }
    }
    return rows
      .map(({ id, name, updatedAt, shotCount, cover }) => ({ id, name, updatedAt, shotCount, cover }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadSavedProject(id: string): Promise<Project | null> {
  const desktop = getDesktopApi();
  if (desktop) {
    try {
      const loaded = await desktop.loadLibraryProject(id);
      if (loaded?.content) {
        const project = parseProjectFile(loaded.content);
        if (loaded.externalPath) setProjectExternalPath(project.id, loaded.externalPath);
        return project;
      }
    } catch {
      // fall through
    }
  }

  try {
    const db = await openProjectDb();
    return await new Promise<Project | null>((resolve, reject) => {
      const tx = db.transaction(IDB_LIBRARY_STORE, 'readonly');
      const req = tx.objectStore(IDB_LIBRARY_STORE).get(id);
      req.onsuccess = () => {
        const row = req.result as LibraryRecord | undefined;
        if (!row?.project || !Array.isArray(row.project.shots)) resolve(null);
        else resolve(row.project);
      };
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_READ_FAILED'));
    });
  } catch {
    return null;
  }
}

export async function deleteSavedProject(id: string): Promise<void> {
  const desktop = getDesktopApi();
  if (desktop) {
    await desktop.deleteLibraryProject(id);
  }
  try {
    const db = await openProjectDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_LIBRARY_STORE, 'readwrite');
      const req = tx.objectStore(IDB_LIBRARY_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('INDEXEDDB_WRITE_FAILED'));
    });
  } catch {
    // ignore idb delete when desktop already handled it
  }
}

/**
 * 将工程保存为 .clapboard 文件。
 * 桌面端：弹出另存为对话框并绑定路径；浏览器：触发下载。
 */
export async function exportProjectToLocalFile(project: Project): Promise<string | null> {
  if (!project) return null;
  const toSave = await convertProjectBlobsToBase64(project);
  const content = serializeProjectFile(toSave);
  const desktop = getDesktopApi();

  if (desktop) {
    const picked = await desktop.saveProjectDialog(safeProjectFileName(toSave.name));
    if (picked.canceled || !picked.filePath) return null;
    await desktop.writeProjectFile(picked.filePath, content);
    setProjectExternalPath(toSave.id, picked.filePath);
    await upsertSavedProject(toSave);
    return picked.filePath;
  }

  const blob = new Blob([content], { type: 'application/x-clapboard-project' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeProjectFileName(toSave.name)}${PROJECT_FILE_EXT}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return null;
}

/** 保存到已绑定的外部路径；若未绑定则等同另存为 */
export async function saveProjectToBoundFile(project: Project): Promise<string | null> {
  if (!project) return null;
  const desktop = getDesktopApi();
  const existing = getProjectExternalPath(project.id);
  if (!desktop || !existing) {
    return exportProjectToLocalFile(project);
  }
  const toSave = await convertProjectBlobsToBase64(project);
  const content = serializeProjectFile(toSave);
  await desktop.writeProjectFile(existing, content);
  await upsertSavedProject(toSave);
  return existing;
}

/** 桌面端打开工程文件对话框；浏览器请用 importProjectFromLocalFile */
export async function openProjectFromDialog(): Promise<{ project: Project; filePath?: string } | null> {
  const desktop = getDesktopApi();
  if (!desktop) return null;
  const result = await desktop.openProjectDialog();
  if (result.canceled || !result.content) return null;
  const project = parseProjectFile(result.content);
  if (result.filePath) setProjectExternalPath(project.id, result.filePath);
  await upsertSavedProject(project);
  return { project, filePath: result.filePath || undefined };
}

/**
 * 从本地选择的工程文件中恢复项目（.clapboard 或旧版 JSON）。
 */
export async function importProjectFromLocalFile(file: File): Promise<Project | null> {
  if (!file) return null;
  try {
    const text = await file.text();
    const project = parseProjectFile(text);
    await upsertSavedProject(project);
    return project;
  } catch (e) {
    console.error('Failed to import project from file', e);
    throw e;
  }
}

















































