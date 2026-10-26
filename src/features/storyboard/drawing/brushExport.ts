import {
  USER_MADE_FOLDER_ID,
  USER_MADE_FOLDER_NAME,
  type CustomBrush,
} from './customBrushes';

const EXPORT_KIND = 'yingge-brush' as const;
const EXPORT_VERSION = 1;

export type ExportedBrushFile = {
  kind: typeof EXPORT_KIND;
  version: number;
  brush: CustomBrush;
};

export function isExportedBrushFile(data: unknown): data is ExportedBrushFile {
  if (!data || typeof data !== 'object') return false;
  const o = data as Record<string, unknown>;
  return o.kind === EXPORT_KIND && typeof o.brush === 'object' && o.brush != null;
}

export function exportBrushToJson(brush: CustomBrush): string {
  const payload: ExportedBrushFile = {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    brush: { ...brush, createdAt: brush.createdAt || Date.now() },
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadBrushJson(brush: CustomBrush) {
  const json = exportBrushToJson(brush);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe = brush.name.replace(/[^\w\u4e00-\u9fff\-]+/g, '_').slice(0, 48) || 'brush';
  a.href = url;
  a.download = `${safe}.yinggebrush.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseBrushJsonFile(file: File): Promise<CustomBrush> {
  const text = await file.text();
  const data = JSON.parse(text) as unknown;
  if (!isExportedBrushFile(data)) throw new Error('invalid brush file');
  const b = data.brush;
  if (!b.tipDataUrl || !b.name) throw new Error('incomplete brush');
  return {
    ...b,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: 'saved',
    folderId: USER_MADE_FOLDER_ID,
    folderName: USER_MADE_FOLDER_NAME,
    createdAt: Date.now(),
  };
}
