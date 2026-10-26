import ExcelJS from 'exceljs';
import type { Project, Shot } from '../types';

export type ExcelImportShot = {
  shotNumber?: string;
  order?: number;
  framing?: string;
  cameraAngle?: string;
  shotType?: string;
  duration?: number;
  notes?: string;
  imageUrl?: string;
};

export type ExcelImportData = {
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
  shots: ExcelImportShot[];
};

const SHOT_HEADERS = [
  'Shot Number',
  'Order',
  'Framing',
  'Camera Angle',
  'Shot Type',
  'Duration',
  'Notes',
  'Image',
] as const;

const IMAGE_COL = 7; // 0-based, column H
const IMAGE_DISPLAY_WIDTH = 160;
const IMAGE_DISPLAY_HEIGHT = 90;
const IMAGE_ROW_HEIGHT = 72;

const HEADER_ALIASES: Record<string, keyof ExcelImportShot | 'imageFile'> = {
  'shot number': 'shotNumber',
  shotnumber: 'shotNumber',
  镜号: 'shotNumber',
  镜头号: 'shotNumber',
  order: 'order',
  排序: 'order',
  framing: 'framing',
  景别: 'framing',
  'camera angle': 'cameraAngle',
  cameraangle: 'cameraAngle',
  机位: 'cameraAngle',
  'shot type': 'shotType',
  shottype: 'shotType',
  镜头类型: 'shotType',
  运镜: 'shotType',
  duration: 'duration',
  时长: 'duration',
  notes: 'notes',
  备注: 'notes',
  说明: 'notes',
  'image file': 'imageFile',
  imagefile: 'imageFile',
  image: 'imageUrl',
  imageurl: 'imageUrl',
  图片: 'imageUrl',
};

function normHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function cellStr(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

function cellNum(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : undefined;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    for (let j = 0; j < sub.length; j++) {
      binary += String.fromCharCode(sub[j]);
    }
  }
  return btoa(binary);
}

function bufferToUint8(buffer: ExcelJS.Buffer | ArrayBuffer | Uint8Array): Uint8Array {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer as ArrayLike<number>);
}

function extensionToMime(ext: string): string {
  const e = ext.toLowerCase();
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  return 'image/png';
}

function toDataUrl(bytes: Uint8Array, extension: string): string {
  return `data:${extensionToMime(extension)};base64,${uint8ToBase64(bytes)}`;
}

async function normalizeImageForExcel(
  dataUrl: string
): Promise<{ base64: string; extension: 'png' | 'jpeg' | 'gif' } | null> {
  const trimmed = dataUrl.trim();
  if (!trimmed) return null;

  const match = /^data:image\/([\w+.-]+);base64,(.+)$/i.exec(trimmed);
  if (match) {
    let ext = match[1].toLowerCase().replace('jpg', 'jpeg');
    if (ext === 'png' || ext === 'jpeg' || ext === 'gif') {
      return { base64: match[2], extension: ext };
    }
  }

  // webp / 其它格式转成 PNG
  try {
    const png = await rasterToPngDataUrl(trimmed.startsWith('data:') ? trimmed : dataUrl);
    const m = /^data:image\/png;base64,(.+)$/i.exec(png);
    if (!m) return null;
    return { base64: m[1], extension: 'png' };
  } catch {
    return null;
  }
}

function rasterToPngDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

function looksLikeDataUrl(value: string): boolean {
  return /^data:image\//i.test(value.trim());
}

/** 将当前工程导出为 .xlsx（含嵌入镜头图片） */
export async function buildStoryboardWorkbook(project: Project, shots: Shot[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ingbord';
  workbook.created = new Date();

  const shotsSheet = workbook.addWorksheet('Shots', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  shotsSheet.columns = [
    { header: SHOT_HEADERS[0], key: 'shotNumber', width: 12 },
    { header: SHOT_HEADERS[1], key: 'order', width: 8 },
    { header: SHOT_HEADERS[2], key: 'framing', width: 10 },
    { header: SHOT_HEADERS[3], key: 'cameraAngle', width: 12 },
    { header: SHOT_HEADERS[4], key: 'shotType', width: 12 },
    { header: SHOT_HEADERS[5], key: 'duration', width: 10 },
    { header: SHOT_HEADERS[6], key: 'notes', width: 36 },
    { header: SHOT_HEADERS[7], key: 'image', width: 24 },
  ];

  shotsSheet.getRow(1).font = { bold: true };

  for (const shot of shots) {
    const row = shotsSheet.addRow([
      shot.shotNumber,
      shot.order,
      shot.framing,
      shot.cameraAngle,
      shot.shotType,
      shot.duration,
      shot.notes || '',
      '',
    ]);

    if (shot.image) {
      const normalized = await normalizeImageForExcel(shot.image);
      if (normalized) {
        const imageId = workbook.addImage({
          base64: normalized.base64,
          extension: normalized.extension,
        });
        row.height = IMAGE_ROW_HEIGHT;
        // tl.row / tl.col 为 0-based
        shotsSheet.addImage(imageId, {
          tl: { col: IMAGE_COL, row: row.number - 1 },
          ext: { width: IMAGE_DISPLAY_WIDTH, height: IMAGE_DISPLAY_HEIGHT },
          editAs: 'oneCell',
        });
      }
    }
  }

  const projectSheet = workbook.addWorksheet('Project');
  projectSheet.columns = [
    { header: 'Key', key: 'key', width: 20 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  const projectRows: Array<[string, string | number]> = [
    ['name', project.name || ''],
    ['aspectRatio', project.aspectRatio || '16:9'],
    ['pdfHeaderText', project.pdfHeaderText || ''],
    ['pdfColumns', project.pdfColumns ?? ''],
    ['pdfRows', project.pdfRows ?? ''],
    ['pdfPageWidthMm', project.pdfPageWidthMm ?? ''],
    ['pdfPageHeightMm', project.pdfPageHeightMm ?? ''],
    ['createdAt', project.createdAt || ''],
  ];
  for (const [key, value] of projectRows) {
    projectSheet.addRow([key, value]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer as ArrayLike<number>);
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function parseProjectFromSheet(sheet: ExcelJS.Worksheet): ExcelImportData['project'] {
  const meta: Record<string, string> = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      const first = cellStr(row.getCell(1).value);
      if (normHeader(first) === 'key') return;
    }
    const key = cellStr(row.getCell(1).value).toLowerCase();
    if (!key || key === 'key') return;
    meta[key] = cellStr(row.getCell(2).value);
  });

  const num = (k: string) => cellNum(meta[k.toLowerCase()]);

  return {
    name: meta.name || undefined,
    aspectRatio: meta.aspectratio || undefined,
    pdfHeaderText: meta.pdfheadertext || undefined,
    pdfColumns: num('pdfcolumns'),
    pdfRows: num('pdfrows'),
    pdfPageWidthMm: num('pdfpagewidthmm'),
    pdfPageHeightMm: num('pdfpageheightmm'),
    createdAt: num('createdat'),
  };
}

function anchorRowIndex(tl: { row?: number; nativeRow?: number } | undefined): number {
  if (!tl) return -1;
  if (typeof tl.row === 'number' && Number.isFinite(tl.row)) {
    return Math.floor(tl.row);
  }
  if (typeof tl.nativeRow === 'number' && Number.isFinite(tl.nativeRow)) {
    return Math.floor(tl.nativeRow);
  }
  return -1;
}

function collectEmbeddedImagesByRow(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet
): Map<number, string> {
  const byRow = new Map<number, string>();
  const images = sheet.getImages?.() || [];

  for (const entry of images) {
    try {
      const imageId = Number(entry.imageId);
      const media = workbook.getImage(imageId);
      if (!media?.buffer) continue;

      const row = anchorRowIndex(entry.range?.tl as { row?: number; nativeRow?: number });
      if (row < 0) continue;

      // exceljs range.tl.row 为 0-based 工作表行（含表头）
      const excelRowNumber = row + 1;
      const ext =
        (media as { extension?: string }).extension ||
        (typeof media.type === 'string' && media.type.includes('/')
          ? media.type.split('/')[1]
          : 'png');
      const dataUrl = toDataUrl(bufferToUint8(media.buffer), ext || 'png');
      // 同一行多图时保留第一张
      if (!byRow.has(excelRowNumber)) {
        byRow.set(excelRowNumber, dataUrl);
      }
    } catch (err) {
      console.warn('读取 Excel 嵌入图片失败:', err);
    }
  }

  return byRow;
}

function parseShotsFromSheet(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet
): ExcelImportShot[] {
  const headerRow = sheet.getRow(1);
  const colMap = new Map<number, keyof ExcelImportShot>();
  let maxCol = Math.max(sheet.columnCount || 0, SHOT_HEADERS.length);

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    maxCol = Math.max(maxCol, colNumber);
    const alias = HEADER_ALIASES[normHeader(cell.value)];
    if (alias && alias !== 'imageFile') {
      colMap.set(colNumber, alias);
    }
  });

  if (colMap.size === 0) {
    const keys: (keyof ExcelImportShot)[] = [
      'shotNumber',
      'order',
      'framing',
      'cameraAngle',
      'shotType',
      'duration',
      'notes',
      'imageUrl',
    ];
    keys.forEach((key, index) => colMap.set(index + 1, key));
  }

  const imagesByRow = collectEmbeddedImagesByRow(workbook, sheet);
  const shots: ExcelImportShot[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const shot: ExcelImportShot = {};
    let hasAny = false;

    colMap.forEach((field, colNumber) => {
      const raw = row.getCell(colNumber).value;
      if (raw == null || raw === '') return;
      hasAny = true;
      if (field === 'order' || field === 'duration') {
        const n = cellNum(raw);
        if (n !== undefined) shot[field] = n;
      } else if (field === 'imageUrl') {
        const text = cellStr(raw);
        if (looksLikeDataUrl(text)) {
          shot.imageUrl = text;
        }
      } else {
        shot[field] = cellStr(raw);
      }
    });

    const embedded = imagesByRow.get(rowNumber);
    if (embedded) {
      shot.imageUrl = embedded;
      hasAny = true;
    }

    if (!hasAny) return;
    if (!shot.shotNumber && shot.order === undefined && !shot.notes && !shot.framing && !shot.imageUrl) {
      return;
    }
    shots.push(shot);
  });

  return shots;
}

/** 从 .xlsx ArrayBuffer 解析为 importProject 可用结构（含嵌入图片 / data URL） */
export async function parseStoryboardWorkbook(buffer: ArrayBuffer): Promise<ExcelImportData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  if (!workbook.worksheets.length) {
    throw new Error('empty workbook');
  }

  const shotsSheet =
    workbook.getWorksheet('Shots') ||
    workbook.worksheets.find((s) => /shot|分镜|镜头/i.test(s.name)) ||
    workbook.worksheets[0];

  if (!shotsSheet) {
    throw new Error('missing shots sheet');
  }

  const shots = parseShotsFromSheet(workbook, shotsSheet);
  if (!shots.length) {
    throw new Error('missing shots');
  }

  const projectSheet =
    workbook.getWorksheet('Project') ||
    workbook.worksheets.find((s) => /project|项目|工程/i.test(s.name));

  const project = projectSheet ? parseProjectFromSheet(projectSheet) : {};

  return { project, shots };
}
