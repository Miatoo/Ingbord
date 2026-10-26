import type { BrushTexture } from './DrawingTools';
import type { BrushPreset } from './brushPresets';
import { BRUSH_PRESETS } from './brushPresets';
import type { PsBrushSettings } from './psBrushSettings';
import { psToLegacyFlat } from './psBrushSettings';

const STORAGE_KEY = 'yingge.customBrushes.v2';
const STORAGE_KEY_LEGACY = 'yingge.customBrushes.v1';

/** Built-in folder for user-saved / image / JSON brushes (not ABR packs). */
export const USER_MADE_FOLDER_ID = 'user-made';
/** Stored display name; UI may prefer i18n over this. */
export const USER_MADE_FOLDER_NAME = '用户自制';

/** One ABR file = one folder; user-made brushes share USER_MADE_FOLDER_ID. */
export type BrushFolderKind = 'user-made' | 'abr';

export type BrushFolder = {
  id: string;
  name: string;
  kind: BrushFolderKind;
  brushes: CustomBrush[];
};

/** User brush: tip image (data URL) stamped by the engine. */
export type CustomBrush = {
  id: string;
  name: string;
  /** Grayscale/alpha tip as PNG data URL */
  tipDataUrl: string;
  /** Dual brush tip (PS Dual Brush) */
  dualTipDataUrl?: string;
  /** Texture pattern data URL (PS Texture) */
  texturePatternDataUrl?: string;
  source: 'image' | 'abr' | 'saved';
  /** Folder grouping: ABR pack id or USER_MADE_FOLDER_ID */
  folderId: string;
  /** Folder display name (ABR filename, or 用户自制) */
  folderName: string;
  defaultSize: number;
  defaultOpacity: number;
  pressure: boolean;
  stabilizer: number;
  sizePressure: number;
  opacityPressure: number;
  taperIn: number;
  taperOut: number;
  minSizeRatio: number;
  density: number;
  tipSpacing: number;
  scatter: number;
  hardness: number;
  tipAngle: number;
  /** Tip roundness 0–1 (from ABR Rndn) */
  thickness?: number;
  directionMode?: 'none' | 'stroke' | 'pen';
  highSpeedTexture?: boolean;
  /** Built-in texture style used when reloading this brush. */
  texture?: BrushTexture;
  textureStrength?: number;
  tipSpacingAuto?: boolean;
  sizeJitter?: number;
  angleJitter?: number;
  /** Full Photoshop panel settings when available */
  ps?: PsBrushSettings;
  createdAt: number;
};

function slugFolderPart(name: string): string {
  return name.replace(/[^\w\u4e00-\u9fff\-]+/g, '_').slice(0, 40) || 'pack';
}

/** Create a unique ABR pack folder id from the .abr filename. */
export function createAbrFolderId(fileBaseName: string): string {
  return `abr-${Date.now()}-${slugFolderPart(fileBaseName)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Fill missing folder fields for brushes saved before folders existed. */
export function normalizeCustomBrush(b: CustomBrush): CustomBrush {
  if (b.folderId && b.folderName) return b;
  if (b.source === 'abr') {
    return {
      ...b,
      folderId: b.folderId || 'abr-legacy',
      folderName: b.folderName || 'ABR（旧）',
    };
  }
  return {
    ...b,
    folderId: USER_MADE_FOLDER_ID,
    folderName: USER_MADE_FOLDER_NAME,
  };
}

/** Group custom brushes into folders (用户自制 first, then ABR packs by created order). */
export function groupBrushesByFolder(brushes: CustomBrush[]): BrushFolder[] {
  const map = new Map<string, BrushFolder>();
  for (const raw of brushes) {
    const b = normalizeCustomBrush(raw);
    const kind: BrushFolderKind = b.folderId === USER_MADE_FOLDER_ID ? 'user-made' : 'abr';
    let folder = map.get(b.folderId);
    if (!folder) {
      folder = {
        id: b.folderId,
        name: kind === 'user-made' ? USER_MADE_FOLDER_NAME : b.folderName,
        kind,
        brushes: [],
      };
      map.set(b.folderId, folder);
    }
    folder.brushes.push(b);
  }
  const folders = [...map.values()];
  folders.sort((a, b) => {
    if (a.kind === 'user-made' && b.kind !== 'user-made') return -1;
    if (b.kind === 'user-made' && a.kind !== 'user-made') return 1;
    const aMin = Math.min(...a.brushes.map((x) => x.createdAt));
    const bMin = Math.min(...b.brushes.map((x) => x.createdAt));
    return aMin - bMin;
  });
  return folders;
}

export type LibraryBrush =
  | { kind: 'builtin'; preset: BrushPreset }
  | { kind: 'custom'; brush: CustomBrush };

function trimDataUrl(url: string | undefined, max = 180_000): string | undefined {
  if (!url) return undefined;
  return url.length > max ? '' : url;
}

export function loadCustomBrushes(): CustomBrush[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!raw) return [];
    const list = JSON.parse(raw) as CustomBrush[];
    if (!Array.isArray(list)) return [];
    const normalized = list.map(normalizeCustomBrush);
    // One-time migrate folder fields onto stored brushes
    if (list.some((b) => !b?.folderId || !b?.folderName)) {
      try {
        saveCustomBrushes(normalized);
      } catch {
        /* ignore */
      }
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveCustomBrushes(list: CustomBrush[]) {
  const pack = (items: CustomBrush[], tipMax = 220_000) =>
    items.map((b) => ({
      ...b,
      tipDataUrl: b.tipDataUrl.length > tipMax ? b.tipDataUrl.slice(0, tipMax) : b.tipDataUrl,
      dualTipDataUrl: trimDataUrl(b.dualTipDataUrl, tipMax),
      texturePatternDataUrl: trimDataUrl(b.texturePatternDataUrl, tipMax),
    }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pack(list)));
  } catch {
    try {
      const slim = pack(list.slice(-12), 120_000).filter((b) => b.tipDataUrl.length > 32);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      /* ignore */
    }
  }
}

export function getLibraryBrushes(): LibraryBrush[] {
  return [
    ...BRUSH_PRESETS.map((preset) => ({ kind: 'builtin' as const, preset })),
    ...loadCustomBrushes().map((brush) => ({ kind: 'custom' as const, brush })),
  ];
}

export function findLibraryBrush(id: string): LibraryBrush | undefined {
  const builtin = BRUSH_PRESETS.find((p) => p.id === id);
  if (builtin) return { kind: 'builtin', preset: builtin };
  const custom = loadCustomBrushes().find((b) => b.id === id);
  if (custom) return { kind: 'custom', brush: custom };
  return undefined;
}

/** Convert image to grayscale pattern tile (for texture). */
export async function imageFileToPatternDataUrl(file: File, maxSize = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(8, Math.round(bitmap.width * scale));
  const h = Math.max(8, Math.round(bitmap.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = lum;
    d[i + 1] = lum;
    d[i + 2] = lum;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

/** Export custom brush as downloadable JSON. */
export function exportCustomBrushJson(brush: CustomBrush, filename?: string) {
  const blob = new Blob([JSON.stringify(brush, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(filename || brush.name || 'brush').replace(/[^\w\u4e00-\u9fff\-]+/g, '_')}.brush.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import brush from .brush.json / JSON file. */
export async function importCustomBrushJson(file: File): Promise<CustomBrush> {
  const text = await file.text();
  const raw = JSON.parse(text) as CustomBrush;
  if (!raw?.tipDataUrl || !raw?.name) throw new Error('invalid brush');
  return {
    ...createCustomBrushFromTip(raw.name, raw.tipDataUrl, 'saved', {
      defaultSize: raw.defaultSize,
      defaultOpacity: raw.defaultOpacity,
      tipSpacing: raw.tipSpacing,
      scatter: raw.scatter,
      hardness: raw.hardness,
      tipAngle: raw.tipAngle,
      thickness: raw.thickness,
      sizePressure: raw.sizePressure,
      opacityPressure: raw.opacityPressure,
      stabilizer: raw.stabilizer,
      minSizeRatio: raw.minSizeRatio,
      directionMode: raw.directionMode,
      texture: raw.texture,
      textureStrength: raw.textureStrength,
      tipSpacingAuto: false,
      dualTipDataUrl: raw.dualTipDataUrl,
      texturePatternDataUrl: raw.texturePatternDataUrl,
      ps: raw.ps,
      sizeJitter: raw.sizeJitter,
      angleJitter: raw.angleJitter,
      taperIn: raw.taperIn,
      taperOut: raw.taperOut,
      density: raw.density,
      pressure: raw.pressure,
      folderId: USER_MADE_FOLDER_ID,
      folderName: USER_MADE_FOLDER_NAME,
    }),
    name: raw.name,
  };
}

/** Convert any image to a compact grayscale tip (black = ink). */
export async function imageFileToTipDataUrl(file: File, maxSize = 128): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(8, Math.round(bitmap.width * scale));
  const h = Math.max(8, Math.round(bitmap.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    const a = d[i + 3];
    // Ink density: dark pixels + existing alpha
    const ink = Math.round(((255 - lum) / 255) * a);
    d[i] = 0;
    d[i + 1] = 0;
    d[i + 2] = 0;
    d[i + 3] = ink;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function tipCanvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export type CustomBrushTipOptions = {
  defaultSize?: number;
  defaultOpacity?: number;
  tipSpacing?: number;
  scatter?: number;
  hardness?: number;
  tipAngle?: number;
  /** Roundness / thickness 0–1 */
  thickness?: number;
  sizePressure?: number;
  opacityPressure?: number;
  stabilizer?: number;
  minSizeRatio?: number;
  directionMode?: 'none' | 'stroke' | 'pen';
  highSpeedTexture?: boolean;
  texture?: BrushTexture;
  textureStrength?: number;
  taperIn?: number;
  taperOut?: number;
  density?: number;
  pressure?: boolean;
  tipSpacingAuto?: boolean;
  sizeJitter?: number;
  angleJitter?: number;
  dualTipDataUrl?: string;
  texturePatternDataUrl?: string;
  ps?: PsBrushSettings;
  /** ABR pack folder; defaults to 用户自制 for image/saved */
  folderId?: string;
  folderName?: string;
};

export function createCustomBrushFromTip(
  name: string,
  tipDataUrl: string,
  source: 'image' | 'abr' | 'saved',
  opts: CustomBrushTipOptions = {}
): CustomBrush {
  const fromPs = opts.ps ? psToLegacyFlat(opts.ps) : null;
  const folderId =
    opts.folderId ??
    (source === 'abr' ? createAbrFolderId(name) : USER_MADE_FOLDER_ID);
  const folderName =
    opts.folderName ??
    (folderId === USER_MADE_FOLDER_ID ? USER_MADE_FOLDER_NAME : name);
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    tipDataUrl,
    dualTipDataUrl: opts.dualTipDataUrl,
    texturePatternDataUrl: opts.texturePatternDataUrl,
    source,
    folderId,
    folderName,
    defaultSize:
      opts.defaultSize ??
      opts.ps?.tipShape.sizePx ??
      (source === 'abr' ? 72 : 24),
    defaultOpacity: opts.defaultOpacity ?? 100,
    pressure: opts.pressure ?? true,
    stabilizer: opts.stabilizer ?? fromPs?.stabilizer ?? 2,
    sizePressure: opts.sizePressure ?? fromPs?.sizePressure ?? 0.85,
    opacityPressure: opts.opacityPressure ?? (source === 'abr' ? 0.45 : 0.2),
    taperIn: opts.taperIn ?? 0,
    taperOut: opts.taperOut ?? 0,
    minSizeRatio: opts.minSizeRatio ?? fromPs?.minSizeRatio ?? 0.15,
    density: opts.density ?? 1,
    tipSpacing: opts.tipSpacing ?? fromPs?.tipSpacing ?? (source === 'abr' ? 0.25 : 0.2),
    // Honest default: no invented scatter unless PS scattering / explicit opts
    scatter: opts.scatter ?? fromPs?.scatter ?? 0,
    hardness: opts.hardness ?? fromPs?.hardness ?? 0.35,
    tipAngle: opts.tipAngle ?? fromPs?.tipAngle ?? 0,
    thickness: opts.thickness ?? fromPs?.thickness,
    directionMode: opts.directionMode ?? fromPs?.directionMode,
    highSpeedTexture: opts.highSpeedTexture,
    texture: opts.texture,
    textureStrength: opts.textureStrength ?? fromPs?.textureStrength ?? 0,
    tipSpacingAuto: opts.tipSpacingAuto ?? fromPs?.tipSpacingAuto ?? false,
    sizeJitter: opts.sizeJitter ?? fromPs?.sizeJitter ?? 0,
    angleJitter: opts.angleJitter ?? fromPs?.angleJitter ?? 0,
    ps: opts.ps,
    createdAt: Date.now(),
  };
}

export function customBrushAsTexture(b: CustomBrush): BrushTexture {
  // ABR / PS brushes must not inherit soft hardness remaps
  if (b.source === 'abr' || b.ps) return b.texture ?? 'normal';
  return b.texture ?? 'soft';
}

/** Cache of tip HTMLImageElement by custom brush id */
const tipImageCache = new Map<string, HTMLImageElement>();

export function getTipImage(brushId: string, tipDataUrl: string): HTMLImageElement | null {
  const hit = tipImageCache.get(brushId);
  if (hit?.complete && hit.naturalWidth > 0) return hit;
  const img = new Image();
  img.src = tipDataUrl;
  tipImageCache.set(brushId, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function preloadTipImage(brushId: string, tipDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = tipImageCache.get(brushId);
    if (existing?.complete && existing.naturalWidth > 0) {
      resolve(existing);
      return;
    }
    const img = new Image();
    img.onload = () => {
      tipImageCache.set(brushId, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('tip'));
    img.src = tipDataUrl;
  });
}
