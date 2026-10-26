import { createId } from './id';
import type { DrawingLayer, LayerBlendMode } from '../types';

export interface RuntimeDrawingLayer extends DrawingLayer {
  canvas: HTMLCanvasElement;
  opacity: number;
  blendMode: LayerBlendMode;
  order: number;
}

const BLEND_TO_COMPOSITE: Record<LayerBlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
};

export function normalizeLayerFields(
  layer: DrawingLayer,
  index: number
): Omit<DrawingLayer, 'image'> & { image: string; opacity: number; blendMode: LayerBlendMode; order: number } {
  return {
    ...layer,
    image: layer.image || '',
    opacity: typeof layer.opacity === 'number' ? Math.min(100, Math.max(0, layer.opacity)) : 100,
    blendMode: layer.blendMode || 'normal',
    order: typeof layer.order === 'number' ? layer.order : index,
  };
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function fillCanvas(canvas: HTMLCanvasElement, color: string | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });
}

export function sortLayersByOrder<T extends { order: number }>(layers: T[]): T[] {
  return [...layers].sort((a, b) => a.order - b.order);
}

export function compositeRuntimeLayers(layers: RuntimeDrawingLayer[], target: HTMLCanvasElement) {
  if (layers.length === 0) return;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const w = layers[0].canvas.width;
  const h = layers[0].canvas.height;
  if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  for (const layer of sortLayersByOrder(layers)) {
    if (!layer.visible) continue;
    ctx.save();
    ctx.globalAlpha = (layer.opacity ?? 100) / 100;
    ctx.globalCompositeOperation = BLEND_TO_COMPOSITE[layer.blendMode || 'normal'] || 'source-over';
    ctx.drawImage(layer.canvas, 0, 0, w, h);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

export function serializeLayers(layers: RuntimeDrawingLayer[]): DrawingLayer[] {
  return sortLayersByOrder(layers).map(({ canvas, ...rest }, index) => ({
    ...rest,
    order: typeof rest.order === 'number' ? rest.order : index,
    opacity: rest.opacity ?? 100,
    blendMode: rest.blendMode || 'normal',
    image: canvas.toDataURL('image/png'),
  }));
}

async function canvasFromImage(src: string, fallback: { width: number; height: number }, fill: string | null) {
  const canvas = createCanvas(fallback.width, fallback.height);
  if (!src) {
    fillCanvas(canvas, fill);
    return canvas;
  }
  try {
    const img = await loadImage(src);
    canvas.width = img.width || fallback.width;
    canvas.height = img.height || fallback.height;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
  } catch {
    fillCanvas(canvas, fill);
  }
  return canvas;
}

function matchSize(layer: RuntimeDrawingLayer, width: number, height: number) {
  if (layer.canvas.width === width && layer.canvas.height === height) return;
  const next = createCanvas(width, height);
  next.getContext('2d')?.drawImage(layer.canvas, 0, 0, width, height);
  layer.canvas = next;
}

export async function buildInitialLayers(
  existing: DrawingLayer[] | undefined,
  fallbackImage: string | undefined,
  size: { width: number; height: number }
): Promise<RuntimeDrawingLayer[]> {
  if (existing && existing.length > 0) {
    const loaded: RuntimeDrawingLayer[] = [];
    for (let i = 0; i < existing.length; i++) {
      const layer = existing[i];
      const fields = normalizeLayerFields(layer, i);
      const canvas = await canvasFromImage(
        layer.image,
        size,
        layer.role === 'background' ? '#ffffff' : null
      );
      loaded.push({ ...fields, canvas });
    }
    const width = loaded[0].canvas.width;
    const height = loaded[0].canvas.height;
    loaded.forEach((layer) => matchSize(layer, width, height));
    return sortLayersByOrder(loaded);
  }

  let width = size.width;
  let height = size.height;
  let content: HTMLImageElement | null = null;
  if (fallbackImage) {
    try {
      content = await loadImage(fallbackImage);
      width = content.width || width;
      height = content.height || height;
    } catch {
      content = null;
    }
  }

  const background = createCanvas(width, height);
  fillCanvas(background, '#ffffff');
  const layers: RuntimeDrawingLayer[] = [
    {
      id: createId(),
      name: '背景',
      image: '',
      visible: true,
      role: 'background',
      opacity: 100,
      blendMode: 'normal',
      order: 0,
      canvas: background,
    },
  ];
  if (content) {
    const draw = createCanvas(width, height);
    draw.getContext('2d')?.drawImage(content, 0, 0);
    layers.push({
      id: createId(),
      name: '图层 2',
      image: '',
      visible: true,
      role: 'draw',
      opacity: 100,
      blendMode: 'normal',
      order: 1,
      canvas: draw,
    });
  }
  return layers;
}

export function createEmptyLayer(width: number, height: number, index: number, order?: number): RuntimeDrawingLayer {
  const canvas = createCanvas(width, height);
  fillCanvas(canvas, null);
  return {
    id: createId(),
    name: `图层 ${index}`,
    image: '',
    visible: true,
    role: 'draw',
    opacity: 100,
    blendMode: 'normal',
    order: typeof order === 'number' ? order : index,
    canvas,
  };
}

export async function appendPoseLayer(
  existing: DrawingLayer[] | undefined,
  fallbackImage: string | undefined,
  posePng: string,
  size: { width: number; height: number }
): Promise<{ layers: DrawingLayer[]; image: string; activeLayerId: string }> {
  const runtime = await buildInitialLayers(existing, existing?.length ? undefined : fallbackImage, size);
  const poseImg = await loadImage(posePng);
  const width = runtime[0].canvas.width;
  const height = runtime[0].canvas.height;
  const poseCanvas = createCanvas(width, height);
  poseCanvas.getContext('2d')?.drawImage(poseImg, 0, 0, width, height);
  const maxOrder = Math.max(...runtime.map((l) => l.order), 0);
  const poseLayer: RuntimeDrawingLayer = {
    id: createId(),
    name: `姿势 ${runtime.length}`,
    image: '',
    visible: true,
    role: 'pose',
    opacity: 100,
    blendMode: 'normal',
    order: maxOrder + 1,
    canvas: poseCanvas,
  };
  runtime.push(poseLayer);
  const composite = createCanvas(width, height);
  compositeRuntimeLayers(runtime, composite);
  return {
    layers: serializeLayers(runtime),
    image: composite.toDataURL('image/png'),
    activeLayerId: poseLayer.id,
  };
}

/** How fill treats anti-aliased / boundary pixels. */
export type FillEdgeMode = 'match' | 'background';

export type FloodFillOptions = {
  tolerance?: number;
  /** match = solid incl. fringe; background = fringe → bg */
  edgeMode?: FillEdgeMode;
  /** Perimeter thickness in px when edgeMode is `background` (default 1). */
  edgeWidth?: number;
  bgR?: number;
  bgG?: number;
  bgB?: number;
  bgA?: number;
};

/** Paint filled pixels within edgeWidth of the fill boundary using background color. */
export function paintFillBackgroundEdge(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  filled: Uint8Array,
  edgeWidth: number,
  br: number,
  bg: number,
  bb: number,
  ba: number
) {
  const edgeW = Math.max(1, Math.round(edgeWidth));
  const r2 = edgeW * edgeW;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = y * width + x;
      if (!filled[vi]) continue;
      let border = false;
      for (let dy = -edgeW; dy <= edgeW && !border; dy++) {
        for (let dx = -edgeW; dx <= edgeW; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !filled[ny * width + nx]) {
            border = true;
            break;
          }
        }
      }
      if (!border) continue;
      const i = vi * 4;
      data[i] = br;
      data[i + 1] = bg;
      data[i + 2] = bb;
      data[i + 3] = ba;
    }
  }
}

/** Flood fill on ImageData; returns true if any pixels changed. */
export function floodFillImageData(
  imageData: ImageData,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  toleranceOrOpts: number | FloodFillOptions = 24
): boolean {
  const opts: FloodFillOptions =
    typeof toleranceOrOpts === 'number' ? { tolerance: toleranceOrOpts } : toleranceOrOpts;
  const tolerance = opts.tolerance ?? 24;
  const edgeMode: FillEdgeMode = opts.edgeMode ?? 'match';
  const { width, height, data } = imageData;
  const x0 = Math.floor(startX);
  const y0 = Math.floor(startY);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return false;

  const idx0 = (y0 * width + x0) * 4;
  const tr = data[idx0];
  const tg = data[idx0 + 1];
  const tb = data[idx0 + 2];
  const ta = data[idx0 + 3];

  if (
    Math.abs(tr - fillR) <= tolerance &&
    Math.abs(tg - fillG) <= tolerance &&
    Math.abs(tb - fillB) <= tolerance &&
    Math.abs(ta - fillA) <= tolerance
  ) {
    return false;
  }

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

  // match: solidify AA fringe neighbors so white outlines disappear
  if (edgeMode === 'match') {
    const fringeTol = Math.max(tolerance, 40);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const vi = y * width + x;
        if (filled[vi]) continue;
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
        // Soft fringe / near-seed / near-white underlay
        const nearSeed =
          Math.abs(data[i] - tr) <= fringeTol &&
          Math.abs(data[i + 1] - tg) <= fringeTol &&
          Math.abs(data[i + 2] - tb) <= fringeTol;
        const pale = a > 0 && a < 250;
        if (nearSeed || pale) {
          data[i] = fillR;
          data[i + 1] = fillG;
          data[i + 2] = fillB;
          data[i + 3] = fillA;
        }
      }
    }
  }

  // background: paint the perimeter of the fill with background color
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

export function hexToRgba(hex: string, alpha01: number): { r: number; g: number; b: number; a: number } {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const n = parseInt(full.slice(0, 6), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: Math.round(Math.min(1, Math.max(0, alpha01)) * 255),
  };
}
