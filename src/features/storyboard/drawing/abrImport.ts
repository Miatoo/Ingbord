/**
 * Photoshop ABR importer (v1/v2 + v6/v7/v9/v10 8BIM).
 * Extracts sampled tip bitmaps and pairs them with brush presets from `desc`
 * (tip shape, shape dynamics, scatter, texture, dual brush, smoothing when present).
 */

import {
  createDefaultPsBrushSettings,
  type PsBrushSettings,
  type PsControlSource,
  type PsDualBlendMode,
  type PsTextureBlendMode,
} from './psBrushSettings';

export type AbrTip = {
  name: string;
  /** Sampled tip id from ABR (`$uuid` or bare uuid), when known */
  uuid?: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

/** Pattern tile from ABR `patt` (used by PS Texture panel). */
export type AbrPattern = {
  name: string;
  uuid?: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
};

/** One brush preset from the ABR library (may share tips). */
export type AbrBrushPreset = {
  name: string;
  /** Tip bitmap (shared across presets that use the same sample) */
  tip: AbrTip;
  /** Optional dual-brush tip */
  dualTip?: AbrTip;
  /** Optional texture pattern tile */
  pattern?: AbrPattern;
  /** Photoshop spacing percent → our tipSpacing ≈ spacing/100 (clamped) */
  spacingPercent: number;
  /** 0–100 PS hardness → engine hardness 0–1 */
  hardnessPercent?: number;
  /** Tip angle degrees */
  tipAngleDeg?: number;
  /** 0–100 PS roundness → engine thickness/roundness 0–1 */
  roundnessPercent?: number;
  /** Diameter in px when present in desc */
  sizePx?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Full PS panel settings when parsed from desc */
  ps?: PsBrushSettings;
};

function readAscii(view: DataView, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function tipFromGray(width: number, height: number, gray: Uint8Array, name: string, uuid?: string): AbrTip | null {
  if (width < 1 || height < 1 || width > 4096 || height > 4096) return null;
  if (gray.length < width * height) return null;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(width, height);
  const d = img.data;
  for (let i = 0; i < width * height; i++) {
    const v = gray[i];
    const o = i * 4;
    d[o] = 0;
    d[o + 1] = 0;
    d[o + 2] = 0;
    // Drop near-black fringe so square tip canvases don't stamp a faint plate
    d[o + 3] = v < 4 ? 0 : v;
  }
  ctx.putImageData(img, 0, 0);
  return { name, uuid, canvas: c, width, height };
}

/** PackBits RLE — clip overruns at row boundary (Photoshop behavior). */
function decodePackBitsRow(slice: Uint8Array, rowWidth: number, out: Uint8Array, outOff: number): void {
  let i = 0;
  let produced = 0;
  while (produced < rowWidth && i < slice.length) {
    const n = slice[i++] << 24 >> 24; // signed byte
    if (n >= 0 && n <= 127) {
      const count = n + 1;
      for (let k = 0; k < count && produced < rowWidth && i < slice.length; k++) {
        out[outOff + produced++] = slice[i++];
      }
    } else if (n !== -128) {
      const count = 1 - n;
      const v = i < slice.length ? slice[i++] : 0;
      for (let k = 0; k < count && produced < rowWidth; k++) {
        out[outOff + produced++] = v;
      }
    }
  }
  while (produced < rowWidth) out[outOff + produced++] = 0;
}

function decodeRle(data: Uint8Array, height: number, width: number, bpp: number): Uint8Array {
  const rowWidth = width * bpp;
  const expected = rowWidth * height;
  const countsLen = height * 2;
  if (data.length < countsLen) throw new Error('truncated RLE counts');
  const out = new Uint8Array(expected);
  let pos = countsLen;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let row = 0; row < height; row++) {
    const count = view.getUint16(row * 2);
    const slice = data.subarray(pos, Math.min(pos + count, data.length));
    decodePackBitsRow(slice, rowWidth, out, row * rowWidth);
    pos += count;
  }
  if (bpp === 2) {
    // 16-bit → 8-bit (high byte)
    const g8 = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) g8[i] = out[i * 2];
    return g8;
  }
  return out;
}

type BimBlock = { tag: string; data: Uint8Array };

function readBimBlocks(buffer: ArrayBuffer): { version: number; subversion: number; blocks: BimBlock[] } {
  const view = new DataView(buffer);
  const version = view.getUint16(0);
  const subversion = view.getUint16(2);
  const u8 = new Uint8Array(buffer);
  const blocks: BimBlock[] = [];
  let o = 4;
  while (o + 12 <= u8.length) {
    if (readAscii(view, o, 4) !== '8BIM') break;
    const tag = readAscii(view, o + 4, 4);
    const len = view.getUint32(o + 8);
    const start = o + 12;
    if (start + len > u8.length) break;
    blocks.push({ tag, data: u8.subarray(start, start + len) });
    o = start + len;
    if (o % 4) o += 4 - (o % 4);
  }
  return { version, subversion, blocks };
}

function normalizeUuid(raw: string): string {
  let s = raw.replace(/\0/g, '').trim();
  if (s.startsWith('$')) s = s.slice(1);
  // samp stores 35 hex chars (truncated last); pad if needed for map keys
  return s.toLowerCase();
}

function uuidPrefixMatch(a: string, b: string): boolean {
  const x = normalizeUuid(a);
  const y = normalizeUuid(b);
  if (!x || !y) return false;
  const n = Math.min(x.length, y.length, 32);
  return x.slice(0, n) === y.slice(0, n);
}

function documentedRectOffset(version: number, subversion: number): number | null {
  if (version === 6 && subversion === 1) return 47;
  if (subversion === 2 && (version === 6 || version === 7 || version === 9 || version === 10)) return 301;
  return null;
}

function findBitmapHeader(entry: Uint8Array, preferredOffset: number | null): {
  rectOff: number;
  width: number;
  height: number;
  depth: number;
  compression: number;
} | null {
  const tryAt = (rs: number) => {
    if (rs + 19 > entry.length) return null;
    const view = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
    const top = view.getInt32(rs);
    const left = view.getInt32(rs + 4);
    const bottom = view.getInt32(rs + 8);
    const right = view.getInt32(rs + 12);
    const w = right - left;
    const h = bottom - top;
    const depth = view.getUint16(rs + 16);
    const compression = entry[rs + 18];
    if (w < 1 || h < 1 || w > 4096 || h > 4096) return null;
    if (depth !== 8 && depth !== 16) return null;
    if (compression > 1) return null;
    return { rectOff: rs, width: w, height: h, depth, compression };
  };

  if (preferredOffset != null) {
    const hit = tryAt(preferredOffset);
    if (hit) return hit;
  }
  const limit = Math.min(entry.length - 19, 2048);
  for (let i = 16; i < limit; i++) {
    const depth = (entry[i] << 8) | entry[i + 1];
    const comp = entry[i + 2];
    if ((depth === 8 || depth === 16) && comp <= 1) {
      const hit = tryAt(i - 16);
      if (hit) return hit;
    }
  }
  return null;
}

function decodeSampEntry(
  entry: Uint8Array,
  preferredOffset: number | null,
  index: number
): AbrTip | null {
  const uuidRaw = entry.length >= 36 ? readAscii(new DataView(entry.buffer, entry.byteOffset, 36), 0, 36) : '';
  const uuid = uuidRaw.startsWith('$') ? normalizeUuid(uuidRaw) : undefined;
  const hdr = findBitmapHeader(entry, preferredOffset);
  if (!hdr) return null;
  const bpp = hdr.depth / 8;
  const expected = hdr.width * hdr.height * bpp;
  const pixels = entry.subarray(hdr.rectOff + 19);
  let gray: Uint8Array;
  try {
    if (hdr.compression === 0) {
      gray = pixels.subarray(0, expected);
      if (bpp === 2) {
        const g8 = new Uint8Array(hdr.width * hdr.height);
        for (let i = 0; i < g8.length; i++) g8[i] = gray[i * 2];
        gray = g8;
      }
    } else {
      gray = decodeRle(pixels, hdr.height, hdr.width, bpp);
    }
  } catch {
    return null;
  }
  return tipFromGray(hdr.width, hdr.height, gray, `ABR tip ${index + 1}`, uuid);
}

function parseSampBlock(data: Uint8Array, version: number, subversion: number): AbrTip[] {
  const preferred = documentedRectOffset(version, subversion);
  const tips: AbrTip[] = [];
  let at = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  while (at + 4 <= data.length) {
    const len = view.getUint32(at);
    if (len === 0) break;
    const start = at + 4;
    const end = start + len;
    if (end > data.length) break;
    const tip = decodeSampEntry(data.subarray(start, end), preferred, tips.length);
    if (tip) tips.push(tip);
    at = end;
    if (at % 4) at += 4 - (at % 4);
  }
  return tips;
}

/** ABR v1 / v2 — classic sampled brushes. */
function parseAbrV1V2(view: DataView, version: number): AbrTip[] {
  const tips: AbrTip[] = [];
  let o = 2;
  const count = view.getUint16(o);
  o += 2;
  for (let i = 0; i < count && o + 10 < view.byteLength; i++) {
    const type = view.getUint16(o);
    o += 2;
    const size = view.getUint32(o);
    o += 4;
    const end = o + size;
    if (end > view.byteLength) break;
    if (type === 2) {
      try {
        let p = o + (version === 1 ? 8 : 4);
        const top = view.getInt16(p);
        const left = view.getInt16(p + 2);
        const bottom = view.getInt16(p + 4);
        const right = view.getInt16(p + 6);
        p += 8;
        const depth = view.getInt16(p);
        p += 2;
        const w = Math.abs(right - left);
        const h = Math.abs(bottom - top);
        if (depth === 8 && w > 0 && h > 0 && p + w * h <= end) {
          const gray = new Uint8Array(view.buffer, view.byteOffset + p, w * h);
          const tip = tipFromGray(w, h, gray, `ABR ${i + 1}`);
          if (tip) tips.push(tip);
        }
      } catch {
        /* skip */
      }
    }
    o = end;
  }
  return tips;
}

type DescBrushInfo = {
  name: string;
  spacingPercent: number;
  tipUuid: string | null;
  tipUuidCandidates?: string[];
  hardnessPercent?: number;
  tipAngleDeg?: number;
  roundnessPercent?: number;
  sizePx?: number;
  flipX?: boolean;
  flipY?: boolean;
  ps?: PsBrushSettings;
};

function mapControlEnum(raw: string): PsControlSource {
  const s = raw.toLowerCase();
  if (s.includes('fade')) return 'fade';
  if (s.includes('pen') || s.includes('pressure') || s.includes('prss')) return 'pressure';
  if (s.includes('tilt')) return 'tilt';
  if (s.includes('initial') && s.includes('dir')) return 'initialDirection';
  if (s.includes('dir')) return 'direction';
  if (s.includes('rot')) return 'rotation';
  return 'off';
}

function mapDualMode(raw: string): PsDualBlendMode {
  const s = raw.toLowerCase();
  if (s.includes('colorburn') || s.includes('clrBurn') || s.includes('颜色加深')) return 'colorBurn';
  if (s.includes('linearburn') || s.includes('linearBurn')) return 'linearBurn';
  if (s.includes('darken')) return 'darken';
  if (s.includes('overlay')) return 'overlay';
  if (s.includes('screen')) return 'screen';
  if (s.includes('lighten')) return 'lighten';
  return 'multiply';
}

function mapTexMode(raw: string): PsTextureBlendMode {
  const s = raw.toLowerCase();
  if (s.includes('darken')) return 'darken';
  if (s.includes('colorburn') || s.includes('clrBurn')) return 'colorBurn';
  if (s.includes('linearburn')) return 'linearBurn';
  if (s.includes('overlay')) return 'overlay';
  if (s.includes('soft')) return 'softLight';
  return 'multiply';
}

function readBoolNear(win: Uint8Array, j: number): boolean | null {
  // bool type often: key + bool + 0/1 byte
  if (j + 9 < win.length) {
    const t = String.fromCharCode(win[j + 4], win[j + 5], win[j + 6], win[j + 7]);
    if (t === 'bool') return win[j + 8] !== 0;
  }
  return null;
}

function findEnumNameAfterKey(win: Uint8Array, j: number): string | null {
  // key + enum + type + TEXT/Idnt — best-effort scan next 48 bytes for ASCII
  const slice = win.subarray(j, Math.min(win.length, j + 64));
  let s = '';
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i];
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
  }
  return s.length > 3 ? s : null;
}

/** Read first UntF (#Prc / #Ang / #Nnn) double after a 4-char key at offset j. */
function readUntFAfterKey(win: Uint8Array, winView: DataView, j: number): number | null {
  // key(4) + UntF(4) + type(4) + double(8) = 20
  if (j + 20 > win.length) return null;
  if (
    win[j + 4] !== 0x55 ||
    win[j + 5] !== 0x6e ||
    win[j + 6] !== 0x74 ||
    win[j + 7] !== 0x46
  ) {
    return null;
  }
  const v = winView.getFloat64(j + 12);
  return Number.isFinite(v) ? v : null;
}

function readUtf16Be(u8: Uint8Array, offset: number, charCount: number): string {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let s = '';
  for (let c = 0; c < charCount; c++) {
    if (offset + 2 > u8.length) break;
    const ch = view.getUint16(offset);
    offset += 2;
    if (c < charCount - 1 && ch) s += String.fromCharCode(ch);
  }
  return s;
}

function keyAt(win: Uint8Array, j: number, a: number, b: number, c: number, d: number): boolean {
  return win[j] === a && win[j + 1] === b && win[j + 2] === c && win[j + 3] === d;
}

function findAsciiOffset(win: Uint8Array, ascii: string): number {
  const m = new TextEncoder().encode(ascii);
  outer: for (let i = 0; i <= win.length - m.length; i++) {
    for (let k = 0; k < m.length; k++) {
      if (win[i + k] !== m[k]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Read `enab` bool inside a descriptor window starting at `from`. */
function findEnabInRange(win: Uint8Array, from: number, windowLen = 512): boolean | null {
  const end = Math.min(win.length - 9, from + windowLen);
  for (let j = Math.max(0, from); j < end; j++) {
    if (!keyAt(win, j, 0x65, 0x6e, 0x61, 0x62)) continue; // enab
    const b = readBoolNear(win, j);
    if (b != null) return b;
  }
  return null;
}

/**
 * Panel is on only when its section exists AND nested `enab` is true.
 * Missing / false enab → off (do not invent presets).
 */
function sectionEnabled(win: Uint8Array, markers: string[]): boolean {
  for (const m of markers) {
    const off = findAsciiOffset(win, m);
    if (off < 0) continue;
    // Class id / unicode name can sit between key and enab — search a wide window
    if (findEnabInRange(win, off, 512) === true) return true;
  }
  return false;
}

/**
 * Heuristic desc parse: find each `brushPreset` class and pull tip shape +
 * dynamics / scatter / texture / dual / smoothing flags when present.
 */
function parseDescPresets(desc: Uint8Array): DescBrushInfo[] {
  const marker = new TextEncoder().encode('brushPreset');
  const starts: number[] = [];
  for (let i = 0; i < desc.length - marker.length; i++) {
    let ok = true;
    for (let k = 0; k < marker.length; k++) {
      if (desc[i + k] !== marker[k]) {
        ok = false;
        break;
      }
    }
    if (ok) starts.push(i);
  }
  if (!starts.length) return [];

  const out: DescBrushInfo[] = [];
  for (let pi = 0; pi < starts.length; pi++) {
    const from = starts[pi];
    const to = pi + 1 < starts.length ? starts[pi + 1] : desc.length;
    const win = desc.subarray(from, to);
    const winView = new DataView(win.buffer, win.byteOffset, win.byteLength);

    let name = '';
    let spacingPercent: number | null = null;
    let hardnessPercent: number | null = null;
    let tipAngleDeg: number | null = null;
    let roundnessPercent: number | null = null;
    let sizePx: number | null = null;
    let flipX: boolean | undefined;
    let flipY: boolean | undefined;
    const tipUuids: string[] = [];

    // Dynamics / scatter / dual / texture collected values
    let sizeJitter: number | null = null;
    let minDiameter: number | null = null;
    let angleJitter: number | null = null;
    let roundnessJitter: number | null = null;
    let scatterAmt: number | null = null;
    let scatterCount: number | null = null;
    let dualSpacing: number | null = null;
    let dualScatter: number | null = null;
    let dualSize: number | null = null;
    let texScale: number | null = null;
    let texDepth: number | null = null;
    let texBright: number | null = null;
    let texContrast: number | null = null;
    let sizeControl: PsControlSource = 'off';
    let angleControl: PsControlSource = 'off';
    let dualMode: PsDualBlendMode = 'multiply';
    let texMode: PsTextureBlendMode = 'multiply';
    let scatterBothAxes = false;
    let dualBothAxes = false;
    let texInvert = false;
    let wetEdges = false;
    let noise = false;
    let buildUp = false;
    let protectTexture = false;

    // Only enable panels that PS actually has checked (enab=true)
    const hasShapeDyn = sectionEnabled(win, ['shapeDynamics', 'shpD']);
    const hasScatter = sectionEnabled(win, ['scattering', 'scatterDynamics', 'sctD']);
    const hasTexture = sectionEnabled(win, ['Txtr', 'textureDynamics', 'TxtD']);
    const hasDual = sectionEnabled(win, ['dualBrush', 'dualBrushDynamics', 'DlBr']);
    const hasSmooth = sectionEnabled(win, ['smoothing', 'Smth']);
    const hasTransfer = sectionEnabled(win, ['transfer', 'TrnS']);
    const hasColorDyn = sectionEnabled(win, ['colorDynamics', 'ClDy']);

    for (let j = 0; j < win.length - 12; j++) {
      // Nm  TEXT
      if (keyAt(win, j, 0x4e, 0x6d, 0x20, 0x20) && keyAt(win, j + 4, 0x54, 0x45, 0x58, 0x54)) {
        const n = winView.getUint32(j + 8);
        if (n > 0 && n < 200 && j + 12 + n * 2 <= win.length) {
          const s = readUtf16Be(win, j + 12, n);
          if (s && !name) name = s;
        }
      }
      if (keyAt(win, j, 0x53, 0x70, 0x63, 0x6e)) {
        const sp = readUntFAfterKey(win, winView, j);
        if (sp != null && sp >= 0 && sp < 1000) {
          if (spacingPercent == null) spacingPercent = sp;
          else if (hasDual && dualSpacing == null) dualSpacing = sp;
        }
      }
      if (keyAt(win, j, 0x48, 0x72, 0x64, 0x6e)) {
        const h = readUntFAfterKey(win, winView, j);
        if (h != null && h >= 0 && h <= 100 && hardnessPercent == null) hardnessPercent = h;
      }
      if (keyAt(win, j, 0x41, 0x6e, 0x67, 0x6c)) {
        const a = readUntFAfterKey(win, winView, j);
        if (a != null && a >= -360 && a <= 360 && tipAngleDeg == null) tipAngleDeg = a;
      }
      if (keyAt(win, j, 0x52, 0x6e, 0x64, 0x6e)) {
        const r = readUntFAfterKey(win, winView, j);
        if (r != null && r >= 0 && r <= 100 && roundnessPercent == null) roundnessPercent = r;
      }
      // Diameter / size (dmtr / size)
      if (keyAt(win, j, 0x64, 0x6d, 0x74, 0x72) || keyAt(win, j, 0x53, 0x7a, 0x20, 0x20)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && v > 1 && v < 5000) {
          if (sizePx == null) sizePx = v;
          else if (hasDual && dualSize == null) dualSize = v;
        }
      }
      // Flip
      if (keyAt(win, j, 0x66, 0x6c, 0x70, 0x58) || keyAt(win, j, 0x46, 0x6c, 0x70, 0x58)) {
        const b = readBoolNear(win, j);
        if (b != null && flipX == null) flipX = b;
      }
      if (keyAt(win, j, 0x66, 0x6c, 0x70, 0x59) || keyAt(win, j, 0x46, 0x6c, 0x70, 0x59)) {
        const b = readBoolNear(win, j);
        if (b != null && flipY == null) flipY = b;
      }
      // Size jitter SzVr
      if (keyAt(win, j, 0x53, 0x7a, 0x56, 0x72)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && sizeJitter == null) sizeJitter = v;
      }
      // Min diameter
      if (keyAt(win, j, 0x4d, 0x6e, 0x44, 0x6d)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && minDiameter == null) minDiameter = v;
      }
      // Angle jitter AngV
      if (keyAt(win, j, 0x41, 0x6e, 0x67, 0x56)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && angleJitter == null) angleJitter = v;
      }
      // Roundness jitter RndV
      if (keyAt(win, j, 0x52, 0x6e, 0x64, 0x56)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && roundnessJitter == null) roundnessJitter = v;
      }
      // Scatter amount
      if (keyAt(win, j, 0x53, 0x74, 0x72, 0x63) || keyAt(win, j, 0x73, 0x63, 0x74, 0x72)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && v >= 0 && v < 5000) {
          if (scatterAmt == null) scatterAmt = v;
          else if (hasDual && dualScatter == null) dualScatter = v;
        }
      }
      // Count Cnt
      if (keyAt(win, j, 0x43, 0x6e, 0x74, 0x20)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && scatterCount == null) scatterCount = Math.round(v);
      }
      // Texture scale / depth
      if (keyAt(win, j, 0x53, 0x63, 0x6c, 0x20) || keyAt(win, j, 0x53, 0x63, 0x6c, 0x65)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && texScale == null) texScale = v;
      }
      if (keyAt(win, j, 0x54, 0x78, 0x44, 0x70) || keyAt(win, j, 0x44, 0x70, 0x74, 0x68)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && texDepth == null) texDepth = v;
      }
      if (keyAt(win, j, 0x42, 0x72, 0x67, 0x68)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && texBright == null) texBright = v;
      }
      if (keyAt(win, j, 0x43, 0x6e, 0x74, 0x72)) {
        const v = readUntFAfterKey(win, winView, j);
        if (v != null && texContrast == null) texContrast = v;
      }
      // Both axes / invert bools
      if (keyAt(win, j, 0x42, 0x74, 0x41, 0x78) || keyAt(win, j, 0x62, 0x74, 0x41, 0x78)) {
        const b = readBoolNear(win, j);
        if (b) {
          if (!scatterBothAxes) scatterBothAxes = true;
          else dualBothAxes = true;
        }
      }
      if (keyAt(win, j, 0x49, 0x6e, 0x76, 0x72) || keyAt(win, j, 0x49, 0x6e, 0x76, 0x74)) {
        const b = readBoolNear(win, j);
        if (b != null) texInvert = b;
      }
      // Misc checkboxes — read bool value, never treat key presence as "on"
      if (keyAt(win, j, 0x57, 0x74, 0x64, 0x67)) {
        // Wtdg — Wet Edges
        const b = readBoolNear(win, j);
        if (b != null) wetEdges = b;
      }
      if (keyAt(win, j, 0x4e, 0x73, 0x65, 0x20) || keyAt(win, j, 0x4e, 0x73, 0x65, 0x65)) {
        // Nse  / Nsee — Noise
        const b = readBoolNear(win, j);
        if (b != null) noise = b;
      }
      if (keyAt(win, j, 0x42, 0x6c, 0x64, 0x55)) {
        // BldU — Build-up
        const b = readBoolNear(win, j);
        if (b != null) buildUp = b;
      }
      if (keyAt(win, j, 0x50, 0x72, 0x74, 0x54)) {
        // PrtT — Protect Texture
        const b = readBoolNear(win, j);
        if (b != null) protectTexture = b;
      }
      // Control enums near known keys
      if (keyAt(win, j, 0x53, 0x7a, 0x43, 0x74) || (keyAt(win, j, 0x63, 0x74, 0x72, 0x6c) && sizeControl === 'off')) {
        const e = findEnumNameAfterKey(win, j);
        if (e) {
          const c = mapControlEnum(e);
          if (c !== 'off' && sizeControl === 'off') sizeControl = c;
        }
      }
      if (keyAt(win, j, 0x41, 0x6e, 0x67, 0x43)) {
        const e = findEnumNameAfterKey(win, j);
        if (e) angleControl = mapControlEnum(e);
      }
      // Dual / texture blend mode strings
      if (hasDual && (keyAt(win, j, 0x4d, 0x64, 0x20, 0x20) || keyAt(win, j, 0x6d, 0x6f, 0x64, 0x65))) {
        const e = findEnumNameAfterKey(win, j);
        if (e && (e.toLowerCase().includes('burn') || e.toLowerCase().includes('dark') || e.toLowerCase().includes('mult'))) {
          dualMode = mapDualMode(e);
        }
      }
      if (hasTexture && keyAt(win, j, 0x4d, 0x64, 0x20, 0x20)) {
        const e = findEnumNameAfterKey(win, j);
        if (e) texMode = mapTexMode(e);
      }

      if (keyAt(win, j, 0x54, 0x45, 0x58, 0x54)) {
        const n = winView.getUint32(j + 4);
        if (n > 30 && n < 48 && j + 8 + n * 2 <= win.length) {
          const s = readUtf16Be(win, j + 8, n);
          if (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(s) || /^\$[0-9a-f-]+$/i.test(s)) {
            tipUuids.push(normalizeUuid(s));
          }
        }
      }
    }

    // Only invent pressure/direction when shape dynamics is actually on and enum missing
    if (hasShapeDyn && sizeControl === 'off') sizeControl = 'pressure';
    if (hasShapeDyn && angleControl === 'off') angleControl = 'direction';

    const tipLong = sizePx ?? 72;
    const ps = createDefaultPsBrushSettings({
      tipShape: {
        sizePx: tipLong,
        angleDeg: tipAngleDeg ?? 0,
        roundnessPercent: roundnessPercent ?? 100,
        hardnessPercent: hardnessPercent ?? 100,
        spacingPercent: spacingPercent ?? 25,
        flipX: flipX ?? false,
        flipY: flipY ?? false,
      },
      shapeDynamics: {
        enabled: hasShapeDyn,
        sizeJitterPercent: sizeJitter ?? 0,
        sizeControl: hasShapeDyn ? sizeControl : 'off',
        minDiameterPercent: minDiameter ?? 0,
        tiltScalePercent: 0,
        angleJitterPercent: angleJitter ?? 0,
        angleControl: hasShapeDyn ? angleControl : 'off',
        roundnessJitterPercent: roundnessJitter ?? 0,
        roundnessControl: 'off',
        minRoundnessPercent: 25,
        flipXJitter: false,
        flipYJitter: false,
        brushProjection: false,
      },
      scattering: {
        enabled: hasScatter,
        scatterPercent: scatterAmt ?? 0,
        bothAxes: scatterBothAxes,
        scatterControl: 'off',
        count: scatterCount ?? 1,
        countJitterPercent: 0,
        countControl: 'off',
      },
      texture: {
        enabled: hasTexture,
        invert: texInvert,
        scalePercent: texScale ?? 100,
        brightness: texBright ?? 50,
        contrast: texContrast ?? 50,
        textureEachTip: false,
        mode: texMode,
        depthPercent: texDepth ?? 100,
        minDepthPercent: 0,
        depthJitterPercent: 0,
        depthControl: 'off',
      },
      dualBrush: {
        enabled: hasDual,
        mode: dualMode,
        flip: false,
        sizePx: dualSize ?? Math.round(tipLong * 1.5),
        spacingPercent: dualSpacing ?? spacingPercent ?? 25,
        scatterPercent: dualScatter ?? 0,
        bothAxes: dualBothAxes,
        count: 1,
        countJitterPercent: 0,
      },
      smoothing: {
        enabled: hasSmooth,
        strengthPercent: hasSmooth ? 35 : 10,
      },
      transfer: {
        enabled: hasTransfer,
        opacityJitterPercent: 0,
        opacityControl: hasTransfer ? 'pressure' : 'off',
        minOpacityPercent: 0,
        flowJitterPercent: 0,
        flowControl: 'off',
        minFlowPercent: 0,
      },
      colorDynamics: {
        enabled: hasColorDyn,
        foregroundBackgroundJitterPercent: 0,
        hueJitterPercent: 0,
        saturationJitterPercent: 0,
        brightnessJitterPercent: 0,
      },
      misc: {
        noise,
        wetEdges,
        buildUp,
        protectTexture,
      },
    });

    if (name) {
      out.push({
        name,
        spacingPercent: spacingPercent ?? 25,
        tipUuid: tipUuids[0] ?? null,
        tipUuidCandidates: tipUuids,
        hardnessPercent: hardnessPercent ?? undefined,
        tipAngleDeg: tipAngleDeg ?? undefined,
        roundnessPercent: roundnessPercent ?? undefined,
        sizePx: sizePx ?? undefined,
        flipX,
        flipY,
        ps,
      });
    }
  }
  return out;
}

function findTipForUuid(tips: AbrTip[], uuid: string | null, candidates?: string[]): AbrTip | null {
  if (!tips.length) return null;
  const list = [...(candidates ?? []), ...(uuid ? [uuid] : [])];
  for (const id of list) {
    const hit = tips.find((t) => t.uuid && uuidPrefixMatch(t.uuid, id));
    if (hit) return hit;
  }
  return [...tips].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
}

function findPatternForUuids(
  patterns: AbrPattern[],
  candidates?: string[]
): AbrPattern | undefined {
  if (!patterns.length) return undefined;
  for (const id of candidates ?? []) {
    const hit = patterns.find((p) => p.uuid && uuidPrefixMatch(p.uuid, id));
    if (hit) return hit;
  }
  // Prefer largest pattern (often paper grain)
  return [...patterns].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/**
 * ABR `patt` block: length-prefixed patterns.
 * Layout (common): ver(4) mode(4) h(2) w(2) unicodeName $uuid\\0 … pixels.
 * Grayscale (mode 1): last w*h bytes. RGB (mode 3): last w*h of R or average downsample.
 */
function parsePattBlock(data: Uint8Array): AbrPattern[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: AbrPattern[] = [];
  let at = 0;
  while (at + 8 < data.length) {
    const plen = view.getUint32(at);
    if (plen < 32 || at + 4 + plen > data.length) break;
    const start = at + 4;
    const end = start + plen;
    try {
      let p = start;
      const ver = view.getUint32(p);
      p += 4;
      const mode = view.getUint32(p);
      p += 4;
      const h = view.getUint16(p);
      const w = view.getUint16(p + 2);
      p += 4;
      if (ver !== 1 || w < 2 || h < 2 || w > 4096 || h > 4096) {
        at = end;
        if (at % 4) at += 4 - (at % 4);
        continue;
      }
      const nameChars = view.getUint32(p);
      p += 4;
      let name = '';
      for (let i = 0; i < nameChars && p + 1 < end; i++) {
        const ch = view.getUint16(p);
        p += 2;
        if (i < nameChars - 1 && ch) name += String.fromCharCode(ch);
      }
      let uuid: string | undefined;
      if (p < end && data[p] === 0x24) {
        let s = '';
        while (p < end && data[p] !== 0) s += String.fromCharCode(data[p++]);
        if (data[p] === 0) p++;
        uuid = normalizeUuid(s);
      }
      // mode 1 = grayscale (w*h); mode 3 = RGB (often w*h*3 at chunk end)
      const pixels = w * h;
      const rgbNeed = pixels * 3;
      const useRgb = mode === 3 && end - p >= rgbNeed;
      const need = useRgb ? rgbNeed : pixels;
      if (end - start < need + 20) {
        at = end;
        if (at % 4) at += 4 - (at % 4);
        continue;
      }
      const pixOff = end - need;
      if (pixOff < p) {
        at = end;
        if (at % 4) at += 4 - (at % 4);
        continue;
      }
      const raw = data.subarray(pixOff, end);
      const gray = new Uint8Array(pixels);
      if (useRgb) {
        for (let i = 0; i < pixels; i++) {
          const r = raw[i * 3];
          const g = raw[i * 3 + 1];
          const b = raw[i * 3 + 2];
          gray[i] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
        }
      } else {
        gray.set(raw.subarray(0, pixels));
      }
      // Cap pattern canvas to 256 for storage / stamp cost
      const maxEdge = 256;
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const cw = Math.max(2, Math.round(w * scale));
      const ch = Math.max(2, Math.round(h * scale));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      if (!ctx) {
        at = end;
        if (at % 4) at += 4 - (at % 4);
        continue;
      }
      const full = document.createElement('canvas');
      full.width = w;
      full.height = h;
      const fctx = full.getContext('2d');
      if (!fctx) {
        at = end;
        if (at % 4) at += 4 - (at % 4);
        continue;
      }
      const img = fctx.createImageData(w, h);
      for (let i = 0; i < pixels; i++) {
        const v = gray[i];
        const o = i * 4;
        img.data[o] = v;
        img.data[o + 1] = v;
        img.data[o + 2] = v;
        img.data[o + 3] = 255;
      }
      fctx.putImageData(img, 0, 0);
      ctx.drawImage(full, 0, 0, cw, ch);
      out.push({ name: name || `Pattern ${out.length + 1}`, uuid, canvas: c, width: cw, height: ch });
    } catch {
      /* skip bad pattern */
    }
    at = end;
    if (at % 4) at += 4 - (at % 4);
  }
  return out;
}

function pairPresets(
  tips: AbrTip[],
  descInfos: DescBrushInfo[],
  patterns: AbrPattern[] = []
): AbrBrushPreset[] {
  if (!descInfos.length) {
    // No desc → tip only; do not invent texture/dual from leftover patt blocks
    return tips.map((tip) => ({
      name: tip.name,
      tip,
      spacingPercent: 25,
      sizePx: Math.max(tip.width, tip.height),
      ps: createDefaultPsBrushSettings({
        tipShape: {
          sizePx: Math.max(16, Math.min(256, Math.max(tip.width, tip.height))),
          spacingPercent: 25,
          angleDeg: 0,
          roundnessPercent: 100,
          hardnessPercent: 50,
          flipX: false,
          flipY: false,
        },
      }),
    }));
  }

  const presets: AbrBrushPreset[] = [];
  for (const info of descInfos) {
    const tip = findTipForUuid(tips, info.tipUuid, info.tipUuidCandidates) ?? tips[0];
    if (!tip) continue;
    // Dual tip: match other UUID, else any different tip when dual enabled
    let dualTip: AbrTip | undefined;
    if (info.ps?.dualBrush.enabled) {
      if (info.tipUuidCandidates) {
        for (const id of info.tipUuidCandidates) {
          const cand = tips.find((t) => t.uuid && uuidPrefixMatch(t.uuid, id) && t !== tip);
          if (cand) {
            dualTip = cand;
            break;
          }
        }
      }
      if (!dualTip && tips.length > 1) {
        dualTip =
          [...tips].filter((t) => t !== tip).sort((a, b) => b.width * b.height - a.width * a.height)[0] ??
          tips[1];
      }
    }
    const pattern =
      info.ps?.texture.enabled
        ? findPatternForUuids(patterns, info.tipUuidCandidates)
        : undefined;
    // Store pattern uuid on ps.texture for persistence
    if (pattern && info.ps) {
      info.ps.texture.patternDataUrl = undefined; // filled by import UI as data URL
    }
    presets.push({
      name: info.name || tip.name,
      tip,
      dualTip,
      pattern,
      spacingPercent: Number.isFinite(info.spacingPercent) ? info.spacingPercent : 25,
      hardnessPercent: info.hardnessPercent,
      tipAngleDeg: info.tipAngleDeg,
      roundnessPercent: info.roundnessPercent,
      sizePx: info.sizePx ?? Math.max(tip.width, tip.height),
      flipX: info.flipX,
      flipY: info.flipY,
      ps: info.ps,
    });
  }

  if (!presets.length) {
    return tips.map((tip) => ({ name: tip.name, tip, spacingPercent: 25 }));
  }
  return presets;
}

export async function parseAbrFile(file: File): Promise<AbrTip[]> {
  const presets = await parseAbrPresets(file);
  // Deduplicate by tip canvas identity for legacy callers
  const seen = new Set<AbrTip>();
  const tips: AbrTip[] = [];
  for (const p of presets) {
    if (seen.has(p.tip)) continue;
    seen.add(p.tip);
    tips.push(p.tip);
  }
  return tips;
}

/** Full ABR import: one entry per brush preset (names + spacing + tip). */
export async function parseAbrPresets(file: File): Promise<AbrBrushPreset[]> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 8) throw new Error('ABR too small');
  const view = new DataView(buffer);
  const version = view.getUint16(0);

  if (version === 1 || version === 2) {
    const tips = parseAbrV1V2(view, version);
    if (!tips.length) throw new Error('No brush tips found in ABR');
    return tips.map((tip) => ({ name: tip.name, tip, spacingPercent: 25 }));
  }

  const { version: ver, subversion, blocks } = readBimBlocks(buffer);
  const samp = blocks.find((b) => b.tag === 'samp');
  const desc = blocks.find((b) => b.tag === 'desc');
  const patt = blocks.find((b) => b.tag === 'patt');

  let tips: AbrTip[] = [];
  if (samp) {
    tips = parseSampBlock(samp.data, ver, subversion);
  }

  if (!tips.length && (ver === 6 || ver >= 6)) {
    // Fallback: try every samp-like block
    for (const b of blocks) {
      if (b.tag === 'samp') tips = parseSampBlock(b.data, ver, subversion);
      if (tips.length) break;
    }
  }

  if (!tips.length) throw new Error('No brush tips found in ABR');

  const patterns = patt ? parsePattBlock(patt.data) : [];
  const descInfos = desc ? parseDescPresets(desc.data) : [];
  return pairPresets(tips, descInfos, patterns);
}

export function abrTipToDataUrl(tip: AbrTip | AbrPattern, maxSize = 256): string {
  const src = tip.canvas;
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  const w = Math.max(8, Math.round(src.width * scale));
  const h = Math.max(8, Math.round(src.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return src.toDataURL('image/png');
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return c.toDataURL('image/png');
}

/** Map PS spacing % to engine tipSpacing (distance as fraction of brush size). */
export function spacingPercentToTipSpacing(spacingPercent: number): number {
  // PS: 1% ≈ continuous dab, 100% ≈ one diameter apart
  const p = Math.max(1, Math.min(400, spacingPercent));
  return Math.max(0.04, Math.min(2.5, p / 100));
}
