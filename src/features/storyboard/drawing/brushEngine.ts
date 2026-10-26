import {
  paintFillBackgroundEdge,
  type FillEdgeMode,
  type FloodFillOptions,
} from '../../../utils/drawingLayers';
import type {
  PsDualBlendMode,
  PsTextureBlendMode,
} from './psBrushSettings';

/** Quantized stamp cache — never allocate a canvas per dab. */
const stampCache = new Map<string, HTMLCanvasElement>();
const STAMP_CACHE_MAX = 48;

/** PS Dual Brush / Texture blend helpers (channel 0–1). */
function blendChannel(mode: PsDualBlendMode | PsTextureBlendMode, base: number, blend: number): number {
  const a = Math.max(0, Math.min(1, base));
  const b = Math.max(0, Math.min(1, blend));
  switch (mode) {
    case 'multiply':
      return a * b;
    case 'darken':
      return Math.min(a, b);
    case 'colorBurn':
      if (b <= 0.001) return 0;
      return Math.max(0, 1 - (1 - a) / b);
    case 'linearBurn':
      return Math.max(0, a + b - 1);
    case 'overlay':
      return a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
    case 'screen':
      return 1 - (1 - a) * (1 - b);
    case 'lighten':
      return Math.max(a, b);
    case 'softLight':
      return b < 0.5
        ? a - (1 - 2 * b) * a * (1 - a)
        : a + (2 * b - 1) * (Math.sqrt(a) - a);
    default:
      return a * b;
  }
}

function stampKey(size: number, color: string, hardness: number, roundness: number) {
  const s = Math.max(2, Math.round(size));
  const h = Math.round(hardness * 20) / 20;
  const r = Math.round(roundness * 20) / 20;
  return `${s}|${color}|${h}|${r}`;
}

/** Parse #rgb / #rrggbb → rgba() strings (avoids black fringe from rgba(0,0,0,0) stops). */
function colorToRgbaStops(color: string): { solid: string; clear: string } {
  const m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) {
    return { solid: color, clear: 'rgba(0,0,0,0)' };
  }
  let hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return {
    solid: `rgba(${r},${g},${b},1)`,
    clear: `rgba(${r},${g},${b},0)`,
  };
}

/** Soft / hard radial stamp (cached). Supports ellipse via roundness (0–1, Y scale). */
export function createBrushStamp(
  size: number,
  color: string,
  hardness = 0.85,
  roundness = 1
): HTMLCanvasElement {
  const key = stampKey(size, color, hardness, roundness);
  const hit = stampCache.get(key);
  if (hit) return hit;

  const r = Math.max(1.5, size / 2);
  const ry = r * Math.max(0.08, Math.min(1, roundness));
  const dimX = Math.ceil(r * 2) + 2;
  const dimY = Math.ceil(ry * 2) + 2;
  const c = document.createElement('canvas');
  c.width = dimX;
  c.height = dimY;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const cx = dimX / 2;
  const cy = dimY / 2;
  const hard = Math.min(0.98, Math.max(0.02, hardness));
  const { solid, clear } = colorToRgbaStops(color);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.08, roundness));
  const g = ctx.createRadialGradient(0, 0, r * hard, 0, 0, r);
  g.addColorStop(0, solid);
  g.addColorStop(Math.min(0.99, hard + 0.05), solid);
  // Same RGB at alpha 0 — interpolating to black transparent caused a dark ring on every dab
  g.addColorStop(1, clear);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (stampCache.size >= STAMP_CACHE_MAX) {
    const first = stampCache.keys().next().value;
    if (first) stampCache.delete(first);
  }
  stampCache.set(key, c);
  return c;
}

/**
 * Paper grain for textured brushes.
 * IMPORTANT: never punch tip alpha with tiled destination-in — that produced a
 * ~128px world-locked mesh where strokes could not deposit paint (tile seams).
 * Grain is applied as a soft per-dab opacity modulation + optional within-tip
 * multiply that keeps a high coverage floor.
 */
const PAPER_SIZE = 64;
let paperLuma: Float32Array | null = null;

function hash2(ix: number, iy: number): number {
  // Toroidal hash — indices wrapped so the map seams cleanly
  const x = ((ix % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
  const y = ((iy % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function valueNoise2(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Seamless luma map in 0–1 (high bias — grain is tonal, not a hole punch). */
function getPaperLuma(): Float32Array {
  if (paperLuma) return paperLuma;
  paperLuma = new Float32Array(PAPER_SIZE * PAPER_SIZE);
  for (let y = 0; y < PAPER_SIZE; y++) {
    for (let x = 0; x < PAPER_SIZE; x++) {
      const n1 = valueNoise2(x / 8, y / 8);
      const n2 = valueNoise2(x / 3 + 11, y / 3 + 5);
      const n = n1 * 0.65 + n2 * 0.35;
      paperLuma[y * PAPER_SIZE + x] = 0.55 + n * 0.45;
    }
  }
  return paperLuma;
}

function samplePaper(worldX: number, worldY: number): number {
  const luma = getPaperLuma();
  const x = ((Math.floor(worldX) % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
  const y = ((Math.floor(worldY) % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
  return luma[y * PAPER_SIZE + x];
}

/** Map texture strength + paper sample → alpha multiplier in [0.72, 1]. */
function paperAlphaFactor(strength: number, worldX: number, worldY: number): number {
  const s = Math.min(1, Math.max(0, strength));
  if (s <= 0.02) return 1;
  const luma = samplePaper(worldX, worldY);
  // lerp(1, luma, s) then lift with a hard floor so coverage never collapses
  const grain = 1 - s + luma * s;
  return 0.72 + 0.28 * grain;
}

export type BrushBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';

export function brushCompositeOp(mode: BrushBlendMode | undefined): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'darken':
      return 'darken';
    case 'lighten':
      return 'lighten';
    default:
      return 'source-over';
  }
}

/** PS-aligned dual brush options for the stamp engine. */
export type DualBrushStrokeOpts = {
  tipImage: CanvasImageSource;
  sizePx: number;
  /** Spacing as fraction of dual size (PS % / 100). */
  spacing: number;
  /** Scatter as fraction of dual size (PS % / 100). */
  scatter: number;
  bothAxes: boolean;
  count: number;
  mode: PsDualBlendMode;
  flip: boolean;
};

/** PS Texture panel options. */
export type TextureStrokeOpts = {
  /** Optional pattern image; else procedural grain. */
  pattern?: CanvasImageSource | null;
  invert: boolean;
  scalePercent: number;
  brightness: number;
  contrast: number;
  textureEachTip: boolean;
  mode: PsTextureBlendMode;
  /** 0–100 depth. */
  depthPercent: number;
};

export type PressureStrokeOptions = {
  color: string;
  size: number;
  alpha: number;
  sizePressure: number;
  opacityPressure: number;
  minSizeRatio: number;
  /** Remap raw pressure 0–1 before size response (settings curve). */
  pressureSizeMap?: (p: number) => number;
  tipSpacing: number;
  scatter: number;
  hardness: number;
  density: number;
  tipAngleDeg?: number;
  sizeJitter?: number;
  angleJitter?: number;
  densityJitter?: number;
  flow?: number;
  spray?: boolean;
  /** Custom tip image (grayscale alpha). When set, stamps tip tinted by color. */
  tipImage?: CanvasImageSource | null;
  /** Roundness 0–1 (PS tip roundness). 1 = circle. */
  roundness?: number;
  /** Vertical thickness scale (calligraphy-like). */
  verticalScale?: number;
  /** Direction: none | stroke | pen */
  directionMode?: 'none' | 'stroke' | 'pen';
  /** Absolute pen/stylus angle in degrees (when directionMode === 'pen'). */
  penAngleDeg?: number;
  /** Entry taper length in px (PS / MoArt 入口). */
  taperIn?: number;
  /** Exit taper length in px — applied when strokeTotalLength is known. */
  taperOut?: number;
  /** Total stroke length in px (set on finalize restamp). */
  strokeTotalLength?: number;
  blendMode?: BrushBlendMode;
  /** Threshold tip alpha (hard ink). */
  binarize?: boolean;
  /** 0–1 paper texture strength (legacy / fallback when psTexture unset). */
  textureStrength?: number;
  /** Erase with destination-out using the same tip shape. */
  erase?: boolean;
  /** Wet edges / watercolor rim. */
  wetEdge?: boolean;
  edgeThickness?: number;
  edgeStrength?: number;
  edgeDarkness?: number;
  /** Ribbon offset along stroke normal. */
  ribbon?: boolean;
  ribbonCycle?: number;
  alternateSides?: boolean;
  /** Extra roundness / size jitter from shape variation 0–1. */
  shapeVariation?: number;
  /** Tip foil: lighter blend for metallic tips. */
  tipFoilComposite?: boolean;
  /** PS tip Flip X / Flip Y */
  flipX?: boolean;
  flipY?: boolean;
  /** PS Scattering: when true, scatter is perpendicular-only unless bothAxes. */
  scatterBothAxes?: boolean;
  /** PS Scattering count (≥1). */
  scatterCount?: number;
  /** Full PS dual brush pass. */
  dual?: DualBrushStrokeOpts | null;
  /** Full PS texture pass (overrides soft paper when set). */
  psTexture?: TextureStrokeOpts | null;
  /** PS Noise flag — fine alpha noise on dab. */
  noise?: boolean;
  /** Build-up: keep source-over accumulation (default); flag reserved for airbrush-like. */
  buildUp?: boolean;
  /** Roundness jitter 0–1 (PS shape dynamics). */
  roundnessJitter?: number;
  /** Flip X/Y jitter (random mirror per dab). */
  flipXJitter?: boolean;
  flipYJitter?: boolean;
  /** Color dynamics: hue shift degrees max. */
  hueJitterDeg?: number;
  saturationJitter?: number;
  brightnessJitter?: number;
};

/** Tint a tip bitmap with brush color into a cached canvas (preserves aspect). */
const tintCache = new Map<string, HTMLCanvasElement>();

function tipNaturalSize(tip: CanvasImageSource): { w: number; h: number } {
  if (tip instanceof HTMLImageElement) {
    return { w: tip.naturalWidth || tip.width || 1, h: tip.naturalHeight || tip.height || 1 };
  }
  if (tip instanceof HTMLCanvasElement) {
    return { w: tip.width || 1, h: tip.height || 1 };
  }
  if (typeof ImageBitmap !== 'undefined' && tip instanceof ImageBitmap) {
    return { w: tip.width || 1, h: tip.height || 1 };
  }
  return { w: 1, h: 1 };
}

/**
 * Soften sampled tip alpha along its own silhouette (no ellipse clip).
 * Hardness 1 = tip shape unchanged; lower = feather edges via alpha blur.
 * Never re-mask to a circle — that crushed irregular ABR tips into a round stamp.
 */
function softenTipAlpha(ctx: CanvasRenderingContext2D, tw: number, th: number, hardness: number) {
  const hard = Math.min(1, Math.max(0, hardness));
  if (hard >= 0.97) return;
  // Stronger soften as hardness drops (0 → ~3px blur radius at tip size)
  const radius = Math.max(1, Math.round((1 - hard) * Math.min(tw, th) * 0.12));
  if (radius < 1) return;
  const src = ctx.getImageData(0, 0, tw, th);
  const out = ctx.createImageData(tw, th);
  const s = src.data;
  const d = out.data;
  // Copy RGB; blur alpha only with a cheap box filter
  for (let i = 0; i < s.length; i += 4) {
    d[i] = s[i];
    d[i + 1] = s[i + 1];
    d[i + 2] = s[i + 2];
    d[i + 3] = s[i + 3];
  }
  const tmp = new Uint8ClampedArray(s.length);
  // Horizontal
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= tw) continue;
        sum += s[(y * tw + xx) * 4 + 3];
        n++;
      }
      tmp[(y * tw + x) * 4 + 3] = Math.round(sum / Math.max(1, n));
    }
  }
  // Vertical → out
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let sum = 0;
      let n = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= th) continue;
        sum += tmp[(yy * tw + x) * 4 + 3];
        n++;
      }
      const i = (y * tw + x) * 4;
      // Keep inside the original silhouette floor so blur doesn't invent a round halo
      const orig = s[i + 3];
      const blurred = Math.round(sum / Math.max(1, n));
      d[i + 3] = orig < 1 ? 0 : Math.min(orig, blurred);
    }
  }
  ctx.putImageData(out, 0, 0);
}

function tintedTip(
  tip: CanvasImageSource,
  color: string,
  size: number,
  binarize = false,
  hardness = 1
): HTMLCanvasElement {
  const longEdge = Math.max(4, Math.round(size));
  const { w: nw, h: nh } = tipNaturalSize(tip);
  const aspect = nw / Math.max(1, nh);
  let tw: number;
  let th: number;
  if (aspect >= 1) {
    tw = longEdge;
    th = Math.max(4, Math.round(longEdge / aspect));
  } else {
    th = longEdge;
    tw = Math.max(4, Math.round(longEdge * aspect));
  }
  const hardQ = Math.round(Math.min(1, Math.max(0, hardness)) * 40) / 40;
  const key = `${color}|${tw}x${th}|bin${binarize ? 1 : 0}|h${hardQ}|v2|${(tip as HTMLImageElement).src?.slice?.(0, 48) ?? `${nw}x${nh}`}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(tip, 0, 0, tw, th);
  if (binarize) {
    const img = ctx.getImageData(0, 0, tw, th);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = d[i + 3] > 96 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = 0;
    }
    ctx.putImageData(img, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, tw, th);
  ctx.globalCompositeOperation = 'source-over';
  // Soften along tip silhouette only — never ellipse-clip (breaks ABR shapes)
  softenTipAlpha(ctx, tw, th, hardQ);
  if (tintCache.size > 64) {
    const first = tintCache.keys().next().value;
    if (first) tintCache.delete(first);
  }
  tintCache.set(key, c);
  return c;
}

export function sizeAtPressure(
  base: number,
  pressure: number,
  sizePressure: number,
  minRatio: number,
  /** Optional 0–1 remap of raw pressure before size response. */
  mapPressure?: (p: number) => number
) {
  const raw = Math.max(0, Math.min(1, pressure));
  const p = mapPressure ? Math.max(0, Math.min(1, mapPressure(raw))) : raw;
  const floor = base * Math.min(1, Math.max(0.04, minRatio));
  if (sizePressure <= 0.01) return base;
  const t = Math.pow(p, 0.85);
  const factor = 1 - sizePressure + sizePressure * (0.08 + t * 1.15);
  return Math.max(floor, base * factor);
}

/**
 * PS-like opacity pressure: light press → near transparent, full press → base.
 * Strength 0–1 how strongly pressure drives alpha (1 ≈ full PS transfer).
 */
export function alphaAtPressure(base: number, pressure: number, opacityPressure: number) {
  const p = Math.max(0, Math.min(1, pressure));
  if (opacityPressure <= 0.01) return base;
  // Ease-in: light press stays pale; full press reaches base. Stronger than linear
  // so mid-strength sliders still read clearly through dab overlap.
  const curved = Math.pow(p, 1.25);
  const mapped = 0.04 + curved * 0.96;
  const factor = 1 - opacityPressure + opacityPressure * mapped;
  return base * Math.max(0.02, Math.min(1, factor));
}

/** Ease size for entry/exit taper (distance along stroke). */
function taperScale(
  strokeDist: number,
  taperIn: number,
  taperOut: number,
  totalLength: number | undefined
): number {
  let s = 1;
  if (taperIn > 0.5 && strokeDist < taperIn) {
    s = Math.max(0.04, strokeDist / taperIn);
  }
  if (taperOut > 0.5 && totalLength != null && totalLength > 0) {
    const fromEnd = totalLength - strokeDist;
    if (fromEnd < taperOut) {
      s = Math.min(s, Math.max(0.04, fromEnd / taperOut));
    }
  }
  return s;
}

export type StrokeStampCursor = {
  lastX: number;
  lastY: number;
  lastP: number;
  distAcc: number;
  started: boolean;
  /** Distance traveled along stroke (px). */
  strokeDist: number;
  /** Last segment angle (rad). */
  lastAngle: number;
  dabIndex: number;
};

export function createStrokeCursor(): StrokeStampCursor {
  return {
    lastX: 0,
    lastY: 0,
    lastP: 0.5,
    distAcc: 0,
    started: false,
    strokeDist: 0,
    lastAngle: 0,
    dabIndex: 0,
  };
}

function darkenHex(color: string, amount: number): string {
  const m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  const f = Math.max(0, 1 - amount);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Scratch for textured / wet-edge dabs (avoids destination-in on the layer). */
let dabScratch: HTMLCanvasElement | null = null;
let dabScratchCtx: CanvasRenderingContext2D | null = null;
/** Region actually painted into dabScratch this dab (tight blit bounds). */
let dabScratchUsedW = 0;
let dabScratchUsedH = 0;

function ensureDabScratch(w: number, h: number): CanvasRenderingContext2D | null {
  const tw = Math.max(4, Math.ceil(w) + 2);
  const th = Math.max(4, Math.ceil(h) + 2);
  dabScratchUsedW = tw;
  dabScratchUsedH = th;
  if (!dabScratch || dabScratch.width < tw || dabScratch.height < th) {
    dabScratch = document.createElement('canvas');
    // Grow with headroom but never force a huge min size for tiny tips
    dabScratch.width = Math.max(tw, 8);
    dabScratch.height = Math.max(th, 8);
    dabScratchCtx = dabScratch.getContext('2d', { willReadFrequently: false });
  }
  return dabScratchCtx;
}

/** Cache pattern luma for tiled sampling. */
const patternLumaCache = new WeakMap<object, { w: number; h: number; luma: Float32Array }>();

function getPatternLuma(pattern: CanvasImageSource): { w: number; h: number; luma: Float32Array } | null {
  const key = pattern as object;
  const hit = patternLumaCache.get(key);
  if (hit) return hit;
  const { w: nw, h: nh } = tipNaturalSize(pattern);
  if (nw < 1 || nh < 1) return null;
  const c = document.createElement('canvas');
  c.width = nw;
  c.height = nh;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(pattern, 0, 0);
  const data = ctx.getImageData(0, 0, nw, nh).data;
  const luma = new Float32Array(nw * nh);
  for (let i = 0; i < nw * nh; i++) {
    const o = i * 4;
    luma[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) / 255;
  }
  const entry = { w: nw, h: nh, luma };
  patternLumaCache.set(key, entry);
  return entry;
}

function samplePatternLuma(
  pattern: CanvasImageSource | null | undefined,
  worldX: number,
  worldY: number,
  scale: number
): number | null {
  if (!pattern) return null;
  const tile = getPatternLuma(pattern);
  if (!tile) return null;
  const u = ((worldX / scale) % tile.w + tile.w) % tile.w;
  const v = ((worldY / scale) % tile.h + tile.h) % tile.h;
  return tile.luma[(v | 0) * tile.w + (u | 0)];
}

/** Apply PS texture depth to stamp alpha in-place (world-locked unless eachTip). */
function applyPsTextureToStamp(
  stamp: HTMLCanvasElement,
  worldX: number,
  worldY: number,
  tex: TextureStrokeOpts
): HTMLCanvasElement {
  const depth = Math.max(0, Math.min(1, tex.depthPercent / 100));
  if (depth < 0.005 && !tex.pattern) return stamp;
  const w = stamp.width;
  const h = stamp.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return stamp;
  ctx.drawImage(stamp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const scale = Math.max(0.05, tex.scalePercent / 100);
  const bright = (tex.brightness - 50) / 50;
  const contrast = 1 + (tex.contrast - 50) / 50;
  const ox = tex.textureEachTip ? Math.random() * 1024 : worldX;
  const oy = tex.textureEachTip ? Math.random() * 1024 : worldY;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 1) continue;
      const fromPat = samplePatternLuma(tex.pattern, ox + x, oy + y, scale);
      let grain = fromPat != null ? fromPat : samplePaper(ox + x / scale, oy + y / scale);
      if (tex.invert) grain = 1 - grain;
      grain = (grain - 0.5) * contrast + 0.5 + bright * 0.25;
      grain = Math.max(0, Math.min(1, grain));
      const blended = blendChannel(tex.mode, d[i + 3] / 255, grain);
      const outA = (d[i + 3] / 255) * (1 - depth) + blended * depth;
      d[i + 3] = Math.round(Math.max(0, Math.min(255, outA * 255)));
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function applyNoiseToStamp(stamp: HTMLCanvasElement, amount = 0.35): HTMLCanvasElement {
  const w = stamp.width;
  const h = stamp.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return stamp;
  ctx.drawImage(stamp, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 1) continue;
    const n = 1 - amount + Math.random() * amount;
    d[i + 3] = Math.round(d[i + 3] * n);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Dual-brush color-burn (etc.) composite of main stamp with dual tip stamps. */
function applyDualBrush(
  mainStamp: HTMLCanvasElement,
  dual: DualBrushStrokeOpts,
  strokeAngle: number
): HTMLCanvasElement {
  const w = mainStamp.width;
  const h = mainStamp.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return mainStamp;
  octx.drawImage(mainStamp, 0, 0);

  const dualSz = Math.max(4, dual.sizePx);
  // Soften dual mask the same way — opaque rectangular dual tips were printing square edges
  const dualTint = tintedTip(dual.tipImage, '#ffffff', Math.min(256, dualSz), false, 0.92);
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d');
  if (!mctx) return mainStamp;

  const count = Math.max(1, Math.min(8, dual.count | 0));
  const scatterPx = dual.scatter * dualSz;
  for (let c = 0; c < count; c++) {
    let ox = 0;
    let oy = 0;
    if (dual.scatter > 0.01) {
      if (dual.bothAxes) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * scatterPx;
        ox = Math.cos(ang) * rad;
        oy = Math.sin(ang) * rad;
      } else {
        const n = strokeAngle + Math.PI / 2;
        const rad = (Math.random() * 2 - 1) * scatterPx;
        ox = Math.cos(n) * rad;
        oy = Math.sin(n) * rad;
      }
    }
    mctx.save();
    mctx.translate(w / 2 + ox, h / 2 + oy);
    if (dual.flip) mctx.scale(-1, 1);
    const dw = dualTint.width;
    const dh = dualTint.height;
    mctx.drawImage(dualTint, -dw / 2, -dh / 2, dw, dh);
    mctx.restore();
  }

  const mainData = octx.getImageData(0, 0, w, h);
  const maskData = mctx.getImageData(0, 0, w, h);
  const md = mainData.data;
  const kd = maskData.data;
  for (let i = 0; i < md.length; i += 4) {
    const baseA = md[i + 3] / 255;
    const blendA = kd[i + 3] / 255;
    if (baseA < 0.001) continue;
    // Dual tip acts as mask: where dual is empty, burn toward 0
    const dualFactor = blendA > 0.001 ? blendA : 0.02;
    const burned = blendChannel(dual.mode, baseA, dualFactor);
    md[i + 3] = Math.round(Math.max(0, Math.min(255, burned * 255)));
  }
  octx.putImageData(mainData, 0, 0);
  return out;
}

function stampWithEffects(
  target: CanvasRenderingContext2D,
  stamp: HTMLCanvasElement,
  sx: number,
  sy: number,
  w: number,
  h: number,
  alpha: number,
  rot: number,
  vert: number,
  opts: PressureStrokeOptions,
  localRound: number,
  sz: number,
  flipX = false,
  flipY = false
) {
  let working = stamp;
  // PS texture panel stays on the PS multiply path; legacy textureStrength
  // uses soft paper alpha (original grain) — do not route it through PS depth.
  let paperGrain = 1;
  if (opts.psTexture && opts.psTexture.depthPercent > 0) {
    working = applyPsTextureToStamp(working, sx, sy, opts.psTexture);
  } else {
    const tex = opts.textureStrength ?? 0;
    if (tex > 0.02) {
      paperGrain = paperAlphaFactor(tex, sx, sy);
    }
  }
  if (opts.noise) working = applyNoiseToStamp(working);
  if (opts.dual?.tipImage) {
    working = applyDualBrush(working, opts.dual, rot);
  }

  const outAlpha = Math.min(1, alpha * paperGrain);
  const wetEdgeStrength = opts.wetEdge ? Math.max(opts.edgeStrength ?? 0, 18) : 0;
  const needScratch = wetEdgeStrength > 0 || opts.tipFoilComposite;

  const sxScale = flipX ? -1 : 1;
  const syScale = flipY ? -1 : 1;

  if (!needScratch) {
    target.save();
    target.globalAlpha = outAlpha;
    target.globalCompositeOperation = opts.erase ? 'destination-out' : 'source-over';
    target.translate(sx, sy);
    target.rotate(rot);
    target.scale(sxScale, vert * syScale);
    target.drawImage(working, -w / 2, -h / 2, w, h);
    target.restore();
    return;
  }

  const grow = opts.wetEdge ? 1 + Math.min(0.4, (opts.edgeThickness ?? 6) / 40) : 1;
  const aw = w * grow;
  const ah = h * grow * Math.abs(vert);
  const extent = Math.ceil(Math.hypot(aw, ah)) + 4;
  const sctx = ensureDabScratch(extent, extent);
  if (!sctx || !dabScratch) {
    target.save();
    target.globalAlpha = outAlpha;
    target.globalCompositeOperation = opts.erase ? 'destination-out' : 'source-over';
    target.translate(sx, sy);
    target.rotate(rot);
    target.scale(sxScale, vert * syScale);
    target.drawImage(working, -w / 2, -h / 2, w, h);
    target.restore();
    return;
  }

  const usedW = dabScratchUsedW;
  const usedH = dabScratchUsedH;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, usedW, usedH);
  sctx.save();
  sctx.translate(usedW / 2, usedH / 2);
  sctx.rotate(rot);
  sctx.scale(sxScale, vert * syScale);

  if (wetEdgeStrength > 0) {
    const rim = createBrushStamp(
      Math.max(4, sz * grow),
      darkenHex(opts.color, Math.min(0.7, (opts.edgeDarkness ?? 0) / 40 + 0.25)),
      Math.min(0.45, opts.hardness * 0.55),
      localRound
    );
    sctx.globalAlpha = Math.min(0.55, (wetEdgeStrength / 40) * 0.5);
    sctx.drawImage(rim, (-w * grow) / 2, (-h * grow) / 2, w * grow, h * grow);
  }

  sctx.globalAlpha = 1;
  sctx.drawImage(working, -w / 2, -h / 2, w, h);
  sctx.restore();

  target.save();
  target.globalAlpha = outAlpha;
  target.globalCompositeOperation = opts.erase
    ? 'destination-out'
    : opts.tipFoilComposite
      ? 'lighter'
      : 'source-over';
  target.drawImage(dabScratch, 0, 0, usedW, usedH, sx - usedW / 2, sy - usedH / 2, usedW, usedH);
  target.restore();
}

function scatterOffset(
  size: number,
  scatter: number,
  bothAxes: boolean,
  strokeAngle: number
): { ox: number; oy: number } {
  if (scatter <= 0.02) return { ox: 0, oy: 0 };
  // PS scatter % maps to diameter fraction; keep magnitude readable
  const scatterPx = size * scatter;
  if (bothAxes) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * scatterPx;
    return { ox: Math.cos(ang) * rad, oy: Math.sin(ang) * rad };
  }
  // Single axis: perpendicular to stroke
  const n = strokeAngle + Math.PI / 2;
  const rad = (Math.random() * 2 - 1) * scatterPx;
  return { ox: Math.cos(n) * rad, oy: Math.sin(n) * rad };
}

function jitterColor(color: string, hueJ: number, satJ: number, briJ: number): string {
  if (!hueJ && !satJ && !briJ) return color;
  const m = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const n = parseInt(hex, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  // Approximate HSB jitter in RGB space
  if (hueJ) {
    const shift = ((Math.random() * 2 - 1) * hueJ) / 360;
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    let h = 0;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    if (d > 0.001) {
      if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
      else if (max === gg) h = ((bb - rr) / d + 2) / 6;
      else h = ((rr - gg) / d + 4) / 6;
    }
    h = (h + shift + 1) % 1;
    const ns = Math.max(0, Math.min(1, s * (1 + (Math.random() * 2 - 1) * satJ)));
    const nv = Math.max(0, Math.min(1, v * (1 + (Math.random() * 2 - 1) * briJ)));
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = nv * (1 - ns);
    const q = nv * (1 - f * ns);
    const t = nv * (1 - (1 - f) * ns);
    let nr = nv;
    let ng = t;
    let nb = p;
    switch (i % 6) {
      case 0:
        nr = nv;
        ng = t;
        nb = p;
        break;
      case 1:
        nr = q;
        ng = nv;
        nb = p;
        break;
      case 2:
        nr = p;
        ng = nv;
        nb = t;
        break;
      case 3:
        nr = p;
        ng = q;
        nb = nv;
        break;
      case 4:
        nr = t;
        ng = p;
        nb = nv;
        break;
      default:
        nr = nv;
        ng = p;
        nb = q;
        break;
    }
    r = Math.round(nr * 255);
    g = Math.round(ng * 255);
    b = Math.round(nb * 255);
  } else {
    const f = 1 + (Math.random() * 2 - 1) * briJ;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
  }
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Dab one stamp (hard = arc fill, soft = cached bitmap). */
function dab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pressure: number,
  opts: PressureStrokeOptions,
  cursor: StrokeStampCursor
) {
  const flow = opts.flow ?? 1;
  const spray = Boolean(opts.spray);
  const roundness = Math.max(0.08, Math.min(1, opts.roundness ?? 1));
  const vert = Math.max(0.35, Math.min(1.6, opts.verticalScale ?? 1));
  const shapeVar = opts.shapeVariation ?? 0;
  const dabColor = jitterColor(
    opts.color,
    opts.hueJitterDeg ?? 0,
    opts.saturationJitter ?? 0,
    opts.brightnessJitter ?? 0
  );
  const localOpts: PressureStrokeOptions =
    dabColor !== opts.color ? { ...opts, color: dabColor } : opts;

  let sz = sizeAtPressure(
    opts.size,
    pressure,
    opts.sizePressure,
    opts.minSizeRatio,
    opts.pressureSizeMap
  );
  if (opts.sizeJitter && opts.sizeJitter > 0) {
    sz *= 1 + (Math.random() * 2 - 1) * opts.sizeJitter * 0.5;
  }
  if (shapeVar > 0) {
    sz *= 1 + (Math.random() * 2 - 1) * shapeVar * 0.25;
  }
  const taper = taperScale(
    cursor.strokeDist,
    opts.taperIn ?? 0,
    opts.taperOut ?? 0,
    opts.strokeTotalLength
  );
  sz = Math.max(0.8, sz * taper);

  let a = alphaAtPressure(opts.alpha, pressure, opts.opacityPressure) * flow;
  if (opts.densityJitter && opts.densityJitter > 0) {
    a *= 1 + (Math.random() * 2 - 1) * opts.densityJitter * 0.35;
  }
  // Taper softens ends. With opacity pressure, use a low floor so light presses stay pale.
  const alphaFloor = (opts.opacityPressure ?? 0) > 0.05 ? 0.015 : 0.04;
  a = Math.max(alphaFloor, Math.min(1, a * (0.7 + taper * 0.3)));

  // Direction angle
  let angle = ((opts.tipAngleDeg ?? 0) * Math.PI) / 180;
  const dir = opts.directionMode ?? 'none';
  if (dir === 'stroke' && cursor.started) {
    angle = cursor.lastAngle + angle;
  } else if (dir === 'pen') {
    angle = (((opts.penAngleDeg ?? opts.tipAngleDeg ?? 0) * Math.PI) / 180) + angle;
  }
  if (opts.angleJitter && opts.angleJitter > 0) {
    angle += ((Math.random() * 2 - 1) * opts.angleJitter * Math.PI) / 180;
  }

  // Ribbon / alternate sides — offset along stroke normal
  let dx = x;
  let dy = y;
  if (opts.ribbon) {
    const cycle = Math.max(0.05, opts.ribbonCycle ?? 1);
    const phase = Math.sin(cursor.dabIndex * cycle * Math.PI);
    const side = opts.alternateSides ? (cursor.dabIndex % 2 === 0 ? 1 : -1) : 1;
    const n = cursor.lastAngle + Math.PI / 2;
    const off = phase * side * sz * 0.35;
    dx += Math.cos(n) * off;
    dy += Math.sin(n) * off;
  }

  let localRound = roundness;
  if (shapeVar > 0) {
    localRound = Math.max(0.08, Math.min(1, roundness * (1 + (Math.random() * 2 - 1) * shapeVar * 0.35)));
  }
  if (opts.roundnessJitter && opts.roundnessJitter > 0) {
    localRound = Math.max(
      0.08,
      Math.min(1, localRound * (1 + (Math.random() * 2 - 1) * opts.roundnessJitter))
    );
  }

  let flipX = Boolean(opts.flipX);
  let flipY = Boolean(opts.flipY);
  if (opts.flipXJitter && Math.random() < 0.5) flipX = !flipX;
  if (opts.flipYJitter && Math.random() < 0.5) flipY = !flipY;

  const bothAxes = Boolean(opts.scatterBothAxes);
  const scatterCount = Math.max(1, Math.min(16, opts.scatterCount ?? 1));

  const placeAndStamp = (
    stamp: HTMLCanvasElement,
    sw: number,
    sh: number,
    pa: number
  ) => {
    for (let c = 0; c < scatterCount; c++) {
      const { ox, oy } = scatterOffset(sz, opts.scatter, bothAxes, cursor.lastAngle || angle);
      stampWithEffects(
        ctx,
        stamp,
        dx + ox,
        dy + oy,
        sw,
        sh,
        pa,
        angle,
        vert,
        localOpts,
        localRound,
        sz,
        flipX,
        flipY
      );
    }
  };

  // Custom tip image path
  if (opts.tipImage) {
    const stamp = tintedTip(
      opts.tipImage,
      dabColor,
      Math.max(4, Math.min(256, sz)),
      Boolean(opts.binarize),
      opts.hardness
    );
    placeAndStamp(stamp, stamp.width, stamp.height * localRound, a);
    cursor.dabIndex++;
    return;
  }

  // Hard round: fastest path — no offscreen canvas (skip when PS effects active)
  const hasPsFx =
    opts.dual ||
    opts.psTexture ||
    opts.noise ||
    flipX ||
    flipY ||
    scatterCount > 1 ||
    opts.scatter > 0.05;
  if (
    !spray &&
    !hasPsFx &&
    opts.hardness >= 0.72 &&
    opts.scatter < 0.05 &&
    localRound > 0.92 &&
    vert > 0.92 &&
    !opts.wetEdge &&
    (opts.textureStrength ?? 0) < 0.05 &&
    !opts.binarize &&
    !opts.tipFoilComposite
  ) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = opts.erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = opts.erase ? '#000000' : dabColor;
    ctx.translate(dx, dy);
    ctx.rotate(angle);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, sz / 2, (sz / 2) * localRound * vert, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    cursor.dabIndex++;
    return;
  }

  const particles = spray
    ? Math.min(8, Math.max(2, Math.round(2 + opts.density * 6)))
    : 1;
  const stamp = createBrushStamp(
    Math.max(4, Math.min(64, sz)),
    dabColor,
    spray ? Math.min(0.2, opts.hardness) : opts.hardness,
    localRound
  );

  for (let i = 0; i < particles; i++) {
    const scale = (spray ? 0.5 + Math.random() * 0.5 : 1) * (sz / Math.max(4, Math.min(64, sz)));
    const w = stamp.width * scale;
    const h = stamp.height * scale;
    const pa = spray ? a * (0.3 + Math.random() * 0.4) : a;
    if (spray) {
      const { ox, oy } = scatterOffset(
        opts.size,
        Math.max(opts.scatter, 0.4),
        true,
        cursor.lastAngle || angle
      );
      stampWithEffects(
        ctx,
        stamp,
        dx + ox,
        dy + oy,
        w,
        h,
        pa,
        angle,
        vert,
        localOpts,
        localRound,
        sz,
        flipX,
        flipY
      );
    } else {
      placeAndStamp(stamp, w, h, pa);
    }
  }
  cursor.dabIndex++;
}

/**
 * Incremental stamp between previous cursor and new point.
 * Call once per pointermove — O(new dabs), not O(whole stroke).
 */
export function stampStrokeSegment(
  ctx: CanvasRenderingContext2D,
  cursor: StrokeStampCursor,
  x: number,
  y: number,
  pressure: number,
  opts: PressureStrokeOptions
): void {
  ctx.save();
  ctx.globalCompositeOperation = opts.erase
    ? 'destination-out'
    : brushCompositeOp(opts.blendMode);

  if (!cursor.started) {
    dab(ctx, x, y, pressure, opts, cursor);
    cursor.lastX = x;
    cursor.lastY = y;
    cursor.lastP = pressure;
    cursor.distAcc = 0;
    cursor.strokeDist = 0;
    cursor.started = true;
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  const dx = x - cursor.lastX;
  const dy = y - cursor.lastY;
  const seg = Math.hypot(dx, dy);
  if (seg < 0.25) {
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  cursor.lastAngle = Math.atan2(dy, dx);

  const midP = (cursor.lastP + pressure) / 2;
  const midSize = sizeAtPressure(
    opts.size,
    midP,
    opts.sizePressure,
    opts.minSizeRatio,
    opts.pressureSizeMap
  );
  // Spacing scales with tip size — never floor at 1.2px (that dashes small pencils).
  const spacing = Math.max(0.35, midSize * Math.max(0.06, opts.tipSpacing));

  cursor.distAcc += seg;
  while (cursor.distAcc >= spacing) {
    cursor.distAcc -= spacing;
    const t = 1 - cursor.distAcc / seg;
    const px = cursor.lastX + dx * t;
    const py = cursor.lastY + dy * t;
    const pr = cursor.lastP + (pressure - cursor.lastP) * t;
    cursor.strokeDist += spacing;
    dab(ctx, px, py, pr, opts, cursor);
  }

  cursor.lastX = x;
  cursor.lastY = y;
  cursor.lastP = pressure;
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Full-path restamp (finalize with taperOut / rare cases). */
export function stampPressureStroke(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; pressure: number }>,
  opts: PressureStrokeOptions
) {
  if (points.length === 0) return;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const withLen: PressureStrokeOptions = {
    ...opts,
    strokeTotalLength: opts.strokeTotalLength ?? total,
  };
  const cursor = createStrokeCursor();
  for (const p of points) {
    stampStrokeSegment(ctx, cursor, p.x, p.y, p.pressure, withLen);
  }
}

export function stampAirbrushStroke(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; pressure: number }>,
  opts: {
    color: string;
    size: number;
    alpha: number;
    density: number;
    spacingRatio: number;
    scatter: number;
    hardness?: number;
  }
) {
  stampPressureStroke(ctx, points, {
    color: opts.color,
    size: opts.size,
    alpha: opts.alpha,
    sizePressure: 0.7,
    opacityPressure: 0.85,
    minSizeRatio: 0.3,
    tipSpacing: opts.spacingRatio,
    scatter: opts.scatter,
    hardness: opts.hardness ?? 0.1,
    density: opts.density,
    spray: true,
  });
}

export function recolorSpritePreserveAlpha(
  sprite: HTMLCanvasElement,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number
) {
  const ctx = sprite.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, sprite.width, sprite.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const srcA = d[i + 3] / 255;
    d[i] = fillR;
    d[i + 1] = fillG;
    d[i + 2] = fillB;
    // Keep source alpha — do not inflate fringe (was causing white/light outlines)
    d[i + 3] = Math.round(Math.min(255, fillA * 255 * srcA));
  }
  ctx.putImageData(img, 0, 0);
}

export function floodFillMasked(
  imageData: ImageData,
  mask: Uint8ClampedArray,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  toleranceOrOpts: number | FloodFillOptions = 28
): boolean {
  const opts: FloodFillOptions =
    typeof toleranceOrOpts === 'number' ? { tolerance: toleranceOrOpts } : toleranceOrOpts;
  const tolerance = opts.tolerance ?? 28;
  const edgeMode: FillEdgeMode = opts.edgeMode ?? 'match';
  const { width, height, data } = imageData;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return false;
  const m0 = (y0 * width + x0) * 4 + 3;
  if (mask[m0] < 8) return false;

  const idx0 = (y0 * width + x0) * 4;
  const tr = data[idx0];
  const tg = data[idx0 + 1];
  const tb = data[idx0 + 2];
  const ta = data[idx0 + 3];

  const match = (i: number) =>
    Math.abs(data[i] - tr) <= tolerance &&
    Math.abs(data[i + 1] - tg) <= tolerance &&
    Math.abs(data[i + 2] - tb) <= tolerance &&
    Math.abs(data[i + 3] - ta) <= tolerance;

  const stack: number[] = [x0, y0];
  const visited = new Uint8Array(width * height);
  const filled = new Uint8Array(width * height);
  let changed = false;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    visited[vi] = 1;
    const mi = vi * 4 + 3;
    if (mask[mi] < 8) continue;
    const i = vi * 4;
    if (!match(i)) continue;
    data[i] = fillR;
    data[i + 1] = fillG;
    data[i + 2] = fillB;
    data[i + 3] = fillA;
    filled[vi] = 1;
    changed = true;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (!changed) return false;

  if (edgeMode === 'match') {
    const fringeTol = Math.max(tolerance, 40);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const vi = y * width + x;
        if (filled[vi] || mask[vi * 4 + 3] < 8) continue;
        let near = false;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (filled[ny * width + nx]) {
            near = true;
            break;
          }
        }
        if (!near) continue;
        const i = vi * 4;
        const a = data[i + 3];
        const nearSeed =
          Math.abs(data[i] - tr) <= fringeTol &&
          Math.abs(data[i + 1] - tg) <= fringeTol &&
          Math.abs(data[i + 2] - tb) <= fringeTol;
        if (nearSeed || (a > 0 && a < 250)) {
          data[i] = fillR;
          data[i + 1] = fillG;
          data[i + 2] = fillB;
          data[i + 3] = fillA;
        }
      }
    }
  }

  if (edgeMode === 'background') {
    paintFillBackgroundEdge(
      data,
      width,
      height,
      filled,
      opts.edgeWidth ?? 1,
      opts.bgR ?? 255,
      opts.bgG ?? 255,
      opts.bgB ?? 255,
      opts.bgA ?? 255
    );
  }

  return changed;
}

export function polygonMask(
  width: number,
  height: number,
  points: Array<{ x: number; y: number }>
): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const empty = new Uint8ClampedArray(width * height * 4);
  if (!ctx || points.length < 3) return empty;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, width, height).data;
}

export function clipToPolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>
) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.clip();
}

export function fillPolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  color: string,
  alpha: number,
  edge?: { color: string; width: number }
) {
  if (points.length < 3) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
  if (edge && edge.width > 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = edge.color;
    ctx.lineWidth = Math.max(1, edge.width);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/** Recolor opaque sprite pixels; optionally paint a background-colored rim of given width. */
export function recolorSpriteWithEdge(
  sprite: HTMLCanvasElement,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  edge?: { r: number; g: number; b: number; a: number; width: number }
) {
  recolorSpritePreserveAlpha(sprite, fillR, fillG, fillB, fillA);
  if (!edge || edge.width <= 0) return;
  const ctx = sprite.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, sprite.width, sprite.height);
  const { width, height, data } = img;
  const filled = new Uint8Array(width * height);
  for (let i = 0, vi = 0; i < data.length; i += 4, vi++) {
    if (data[i + 3] > 8) filled[vi] = 1;
  }
  paintFillBackgroundEdge(
    data,
    width,
    height,
    filled,
    edge.width,
    edge.r,
    edge.g,
    edge.b,
    edge.a
  );
  ctx.putImageData(img, 0, 0);
}

export function velocityToPressure(
  distPx: number,
  dtMs: number,
  prevPressure: number
): number {
  const dt = Math.max(1, dtMs);
  const speed = distPx / dt;
  const raw = 1 - Math.min(1, speed / 0.55);
  const target = 0.12 + raw * 0.88;
  return prevPressure * 0.55 + target * 0.45;
}
