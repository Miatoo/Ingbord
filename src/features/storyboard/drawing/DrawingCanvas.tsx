

import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { getStroke, StrokeOptions } from 'perfect-freehand';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import {
  buildInitialLayers,
  compositeRuntimeLayers,
  createEmptyLayer,
  fillCanvas,
  floodFillImageData,
  hexToRgba,
  RuntimeDrawingLayer,
  serializeLayers,
  type FillEdgeMode,
} from '../../../utils/drawingLayers';
import type { DrawingLayer, LayerBlendMode } from '../../../types';
import { useTranslation } from '../../../i18n/useTranslation';
import { DrawingTool, BrushTexture } from './DrawingTools';
import type { ArrowStyle } from './brushPresets';
import {
  clipToPolygon,
  createStrokeCursor,
  fillPolygon,
  floodFillMasked,
  polygonMask,
  recolorSpritePreserveAlpha,
  recolorSpriteWithEdge,
  stampPressureStroke,
  stampStrokeSegment,
  velocityToPressure,
  type BrushBlendMode,
  type StrokeStampCursor,
} from './brushEngine';
import { psSettingsToStrokePartial } from './psStrokeOpts';
import type { PsBrushSettings } from './psBrushSettings';
import { evaluatePressureCurve } from '../../../utils/pressureCurve';

/** Touch: hold still to eyedrop; move past slop cancels hold and draws. */
const LONG_PRESS_MS = 450;
const LONG_PRESS_SLOP_PX = 14;
/** Two-finger light tap (no pinch travel) → undo. */
const TWO_FINGER_TAP_MS = 400;
const TWO_FINGER_TAP_SLOP_PX = 16;

/** Resolve stylus pressure. Only real pens feed device pressure (finger/mouse stay neutral). */
function resolveStrokePressure(
  e: MouseEvent | TouchEvent | PointerEvent,
  alreadyUsingDevice: boolean
): { pressure: number; hasDevicePressure: boolean } {
  if (e instanceof PointerEvent && e.pointerType === 'pen') {
    const p = e.pressure > 0 ? e.pressure : alreadyUsingDevice ? 0.25 : 0.5;
    return { pressure: Math.min(1, Math.max(0.05, p)), hasDevicePressure: true };
  }
  return { pressure: 0.5, hasDevicePressure: false };
}

/** Pen barrel / tilt ??tip angle in degrees (PS ?Pen Direction??. */
function resolvePenAngleDeg(e: MouseEvent | TouchEvent | PointerEvent): number | null {
  if (!(e instanceof PointerEvent) || e.pointerType !== 'pen') return null;
  const twist = typeof e.twist === 'number' ? e.twist : 0;
  if (twist) return twist;
  const tiltX = typeof e.tiltX === 'number' ? e.tiltX : 0;
  const tiltY = typeof e.tiltY === 'number' ? e.tiltY : 0;
  if (tiltX === 0 && tiltY === 0) return null;
  return (Math.atan2(tiltX, tiltY) * 180) / Math.PI;
}

type BrushStrokeTuning = {
  taperIn: number;
  taperOut: number;
  stabilizer: number;
};

function freehandOptions(
  texture: BrushTexture,
  brushSize: number,
  smoothness: number,
  enablePressure: boolean,
  useDevicePressure: boolean,
  isComplete: boolean,
  tuning: BrushStrokeTuning = { taperIn: 0.15, taperOut: 0.2, stabilizer: 0 }
): StrokeOptions {
  const stabBoost = (Math.min(10, Math.max(0, tuning.stabilizer)) / 10) * 0.35;
  const streamline = 0.2 + (Math.min(10, Math.max(1, smoothness)) / 10) * 0.5 + stabBoost;
  const thinning =
    enablePressure && useDevicePressure
      ? undefined
      : 0;
  const startTaper = Math.max(0, tuning.taperIn);
  const endTaper = isComplete ? Math.max(0, tuning.taperOut) : 0;
  if (texture === 'pencil') {
    return {
      size: Math.max(1.2, brushSize * 0.85),
      thinning: thinning ?? 0.72,
      smoothing: 0.42,
      streamline: streamline * 0.65,
      simulatePressure: false,
      easing: (t) => t * t,
      start: { cap: true, taper: Math.max(startTaper, brushSize * 0.35) },
      end: { cap: true, taper: endTaper || (isComplete ? Math.max(4, brushSize) : 0) },
      last: isComplete,
    };
  }
  if (texture === 'marker') {
    return {
      size: Math.max(6, brushSize * 2.6),
      thinning: thinning ?? 0.08,
      smoothing: 0.75,
      streamline,
      simulatePressure: false,
      start: { cap: true, taper: startTaper * 0.2 },
      end: { cap: true, taper: endTaper * 0.2 },
      last: isComplete,
    };
  }
  if (texture === 'soft' || texture === 'airbrush') {
    return {
      size: Math.max(4, brushSize * (texture === 'airbrush' ? 3.2 : 1.8)),
      thinning: thinning ?? 0.35,
      smoothing: 0.8,
      streamline: streamline * 1.1,
      simulatePressure: false,
      start: { cap: true, taper: Math.max(startTaper, brushSize * 0.5) },
      end: { cap: true, taper: endTaper || (isComplete ? Math.max(6, brushSize * 1.2) : 0) },
      last: isComplete,
    };
  }
  if (texture === 'calligraphy') {
    return {
      size: Math.max(2, brushSize * 1.4),
      thinning: thinning ?? 0.85,
      smoothing: 0.35,
      streamline: streamline * 0.7,
      simulatePressure: false,
      start: { cap: true, taper: Math.max(startTaper, brushSize * 0.2) },
      end: { cap: true, taper: endTaper || (isComplete ? Math.max(8, brushSize * 2) : 0) },
      last: isComplete,
    };
  }
  // hard / normal
  return {
    size: Math.max(1.5, brushSize),
    thinning: texture === 'hard' ? (thinning ?? 0.15) : thinning ?? 0.55,
    smoothing: texture === 'hard' ? 0.25 : 0.55,
    streamline,
    simulatePressure: false,
    start: { cap: true, taper: startTaper },
    end: { cap: true, taper: endTaper },
    last: isComplete,
  };
}

function fillFreehandStroke(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; pressure: number }>,
  options: StrokeOptions,
  color: string,
  alpha: number
) {
  if (points.length === 0) return;
  const input = points.map((p) => [p.x, p.y, p.pressure] as [number, number, number]);
  const outline = getStroke(input, options);
  if (outline.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1];
    const [x1, y1] = outline[i];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

type SelectionBounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };

interface FloatingSelection {
  points: Array<{ x: number; y: number }>;
  localPoints: Array<{ x: number; y: number }>;
  imageData: string;
  bounds: SelectionBounds;
  rotation: number;
}

type TransformHandle = 'move' | 'rotate' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w';

function selectionCenter(bounds: SelectionBounds) {
  return { x: bounds.minX + bounds.width / 2, y: bounds.minY + bounds.height / 2 };
}

function worldFromLocal(bounds: SelectionBounds, rotation: number, u: number, v: number) {
  const center = selectionCenter(bounds);
  const lx = (u - 0.5) * bounds.width;
  const ly = (v - 0.5) * bounds.height;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return { x: center.x + lx * c - ly * s, y: center.y + lx * s + ly * c };
}

function toLocalPoint(bounds: SelectionBounds, rotation: number, x: number, y: number) {
  const center = selectionCenter(bounds);
  const dx = x - center.x;
  const dy = y - center.y;
  const c = Math.cos(-rotation);
  const s = Math.sin(-rotation);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function drawTransformedSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  bounds: SelectionBounds,
  rotation: number
) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Integer placement when unrotated avoids subpixel gaps / white fringes
  if (Math.abs(rotation) < 1e-6) {
    ctx.drawImage(
      sprite,
      Math.round(bounds.minX),
      Math.round(bounds.minY),
      Math.round(bounds.width),
      Math.round(bounds.height)
    );
  } else {
    const center = selectionCenter(bounds);
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);
    ctx.drawImage(sprite, -bounds.width / 2, -bounds.height / 2, bounds.width, bounds.height);
  }
  ctx.restore();
}

/** Cut layer pixels exactly where the sprite has alpha — no path-AA mismatch / white ring. */
function cutHoleMatchingSprite(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  minX: number,
  minY: number
) {
  const w = sprite.width;
  const h = sprite.height;
  const sctx = sprite.getContext('2d');
  if (!sctx || w < 1 || h < 1) return;
  const src = sctx.getImageData(0, 0, w, h);
  const erase = document.createElement('canvas');
  erase.width = w;
  erase.height = h;
  const ectx = erase.getContext('2d');
  if (!ectx) return;
  const ed = ectx.createImageData(w, h);
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3];
    if (a === 0) continue;
    ed.data[i] = 255;
    ed.data[i + 1] = 255;
    ed.data[i + 2] = 255;
    ed.data[i + 3] = a;
  }
  ectx.putImageData(ed, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(erase, Math.round(minX), Math.round(minY));
  ctx.restore();
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = source.width;
  c.height = source.height;
  c.getContext('2d')?.drawImage(source, 0, 0);
  return c;
}

function selectionUntransformed(
  sel: FloatingSelection,
  origin: { minX: number; minY: number; width: number; height: number; rotation: number } | null
): boolean {
  if (!origin) return Math.abs(sel.rotation) < 1e-6;
  return (
    Math.abs(sel.rotation - origin.rotation) < 1e-6 &&
    Math.abs(sel.bounds.minX - origin.minX) < 0.5 &&
    Math.abs(sel.bounds.minY - origin.minY) < 0.5 &&
    Math.abs(sel.bounds.width - origin.width) < 0.5 &&
    Math.abs(sel.bounds.height - origin.height) < 0.5
  );
}

function selectionOutline(sel: FloatingSelection) {
  if (sel.localPoints.length > 2) {
    return sel.localPoints.map((point) => worldFromLocal(sel.bounds, sel.rotation, point.x, point.y));
  }
  return [
    worldFromLocal(sel.bounds, sel.rotation, 0, 0),
    worldFromLocal(sel.bounds, sel.rotation, 1, 0),
    worldFromLocal(sel.bounds, sel.rotation, 1, 1),
    worldFromLocal(sel.bounds, sel.rotation, 0, 1),
  ];
}

/**
 * Marching ants as 1×1 pixel fills — never ctx.stroke().
 * Stroke antialiasing bridges dash gaps into a continuous white hairline on dark art.
 */
function strokeMarchingAnts(
  ctx: CanvasRenderingContext2D,
  outline: Array<{ x: number; y: number }>,
  dashOffset: number
) {
  if (outline.length < 2) return;
  const pts = outline.slice();
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.x !== last.x || first.y !== last.y) pts.push({ x: first.x, y: first.y });

  const unit = 4;
  const period = unit * 2;
  let traveled = ((-dashOffset % period) + period) % period;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  for (let i = 0; i < pts.length - 1; i++) {
    const x0 = pts[i].x;
    const y0 = pts[i].y;
    const x1 = pts[i + 1].x;
    const y1 = pts[i + 1].y;
    const edgeLen = Math.hypot(x1 - x0, y1 - y0);
    if (edgeLen < 0.5) continue;
    const steps = Math.max(1, Math.ceil(edgeLen));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const px = Math.round(x0 + (x1 - x0) * t);
      const py = Math.round(y0 + (y1 - y0) * t);
      const phase = traveled % period;
      ctx.fillStyle = phase < unit ? '#111111' : '#ffffff';
      ctx.fillRect(px, py, 1, 1);
      traveled += edgeLen / steps;
    }
  }
  ctx.restore();
}

function paintSelectionOverlay(overlay: HTMLCanvasElement, sel: FloatingSelection, dash: number) {
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  const outline = selectionOutline(sel);
  if (outline.length < 2) return;
  const handle = Math.max(10, overlay.width / 140);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  strokeMarchingAnts(ctx, outline, dash);

  const corners = [
    worldFromLocal(sel.bounds, sel.rotation, 0, 0),
    worldFromLocal(sel.bounds, sel.rotation, 1, 0),
    worldFromLocal(sel.bounds, sel.rotation, 1, 1),
    worldFromLocal(sel.bounds, sel.rotation, 0, 1),
  ];
  const top = worldFromLocal(sel.bounds, sel.rotation, 0.5, 0);
  const center = selectionCenter(sel.bounds);
  const angle = Math.atan2(top.y - center.y, top.x - center.x);
  const rotateHandle = {
    x: top.x + Math.cos(angle) * handle * 2.4,
    y: top.y + Math.sin(angle) * handle * 2.4,
  };
  const edges = [
    worldFromLocal(sel.bounds, sel.rotation, 0.5, 0),
    worldFromLocal(sel.bounds, sel.rotation, 1, 0.5),
    worldFromLocal(sel.bounds, sel.rotation, 0.5, 1),
    worldFromLocal(sel.bounds, sel.rotation, 0, 0.5),
  ];
  // Transform chrome: blue only (no white stroke underlay that can look like a fringe)
  ctx.setLineDash([]);
  ctx.strokeStyle = '#0066ff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(corners[0].x) + 0.5, Math.round(corners[0].y) + 0.5);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(Math.round(corners[i].x) + 0.5, Math.round(corners[i].y) + 0.5);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(Math.round(top.x) + 0.5, Math.round(top.y) + 0.5);
  ctx.lineTo(Math.round(rotateHandle.x) + 0.5, Math.round(rotateHandle.y) + 0.5);
  ctx.stroke();
  const hs = Math.max(6, Math.round(handle));
  for (const point of [...corners, ...edges]) {
    const hx = Math.round(point.x - hs / 2);
    const hy = Math.round(point.y - hs / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx, hy, hs, hs);
    ctx.strokeRect(hx + 0.5, hy + 0.5, hs - 1, hs - 1);
  }
  ctx.beginPath();
  ctx.arc(Math.round(rotateHandle.x), Math.round(rotateHandle.y), Math.round(handle * 0.42), 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function hitTestSelection(sel: FloatingSelection, x: number, y: number, canvasWidth: number): TransformHandle | null {
  const handle = Math.max(10, canvasWidth / 140);
  const top = worldFromLocal(sel.bounds, sel.rotation, 0.5, 0);
  const center = selectionCenter(sel.bounds);
  const angle = Math.atan2(top.y - center.y, top.x - center.x);
  const rotateHandle = {
    x: top.x + Math.cos(angle) * handle * 2.4,
    y: top.y + Math.sin(angle) * handle * 2.4,
  };
  if (Math.hypot(x - rotateHandle.x, y - rotateHandle.y) <= handle) return 'rotate';
  const handles: Array<[TransformHandle, number, number]> = [
    ['nw', 0, 0], ['ne', 1, 0], ['se', 1, 1], ['sw', 0, 1],
    ['n', 0.5, 0], ['e', 1, 0.5], ['s', 0.5, 1], ['w', 0, 0.5],
  ];
  for (const [name, u, v] of handles) {
    const point = worldFromLocal(sel.bounds, sel.rotation, u, v);
    if (Math.hypot(x - point.x, y - point.y) <= handle) return name;
  }
  const local = toLocalPoint(sel.bounds, sel.rotation, x, y);
  if (Math.abs(local.x) <= sel.bounds.width / 2 && Math.abs(local.y) <= sel.bounds.height / 2) return 'move';
  if (Math.abs(local.x) <= sel.bounds.width / 2 + handle * 2 && Math.abs(local.y) <= sel.bounds.height / 2 + handle * 2) {
    return 'rotate';
  }
  return null;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

interface DrawingCanvasProps {
  shotId: string;
  tool: DrawingTool;
  color: string;
  brushSize: number;
  opacity?: number; // 0-100
  enablePressure?: boolean; // Effective brush size with pressure
  enableOpacityPressure?: boolean; // ????????????????
  smoothness?: number; // ????1-10
  brushTexture?: BrushTexture; // ????
  arrowStyle?: ArrowStyle;
  stabilizer?: number;
  sizePressure?: number;
  opacityPressureStrength?: number;
  taperIn?: number;
  taperOut?: number;
  minSizeRatio?: number;
  density?: number;
  tipSpacing?: number;
  scatter?: number;
  hardness?: number;
  tipAngle?: number;
  speedTaper?: boolean;
  watercolorEdge?: boolean;
  edgeThickness?: number;
  edgeStrength?: number;
  edgeDarkness?: number;
  edgeBlur?: number;
  flow?: number;
  /** Tip roundness 0.2?? (PS roundness). */
  thickness?: number;
  sizeJitter?: number;
  angleJitter?: number;
  densityJitter?: number;
  tipSpacingAuto?: boolean;
  directionMode?: 'none' | 'stroke' | 'pen';
  binarize?: boolean;
  blendMode?: BrushBlendMode;
  ribbon?: boolean;
  ribbonCycle?: number;
  alternateSides?: boolean;
  verticalThickness?: boolean;
  tipFoilComposite?: boolean;
  highSpeedTexture?: boolean;
  /** User paper grain 0?1 (overrides pencil default when > 0). */
  textureStrength?: number;
  shapeVariation?: number;
  /** Custom brush tip (from image / ABR library). */
  tipImage?: CanvasImageSource | null;
  /** PS Dual Brush second tip. */
  dualTipImage?: CanvasImageSource | null;
  /** PS Texture pattern image. */
  texturePatternImage?: CanvasImageSource | null;
  /** Full Photoshop brush settings (preferred over flat sliders when set). */
  psBrush?: PsBrushSettings | null;
  /** Background swatch — used by fill edge mode `background`. */
  backgroundColor?: string;
  fillEdgeMode?: FillEdgeMode;
  /** Perimeter thickness (px) when fill edge mode is `background`. */
  fillEdgeWidth?: number;
  /** Max undo / redo stack depth (from settings). */
  maxHistory?: number;
  /** Remap stylus pressure → size (settings curve). */
  pressureSizeCurve?: Array<{ x: number; y: number }>;
  onHistoryChange?: (state: HistoryState | boolean) => void;
  onLayersChange?: (layers: DrawingLayer[], activeLayerId: string) => void;
  onColorSampled?: (color: string) => void;
}

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;
  resetView: () => void;
  fitToScreen: () => void;
  getTransform: () => { scale: number; translateX: number; translateY: number; rotation: number };
  selectLayer: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  toggleLayerVisible: (id: string) => void;
  clearSelection: () => void;
  reorderLayers: (orderedIdsBottomToTop: string[]) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, mode: LayerBlendMode) => void;
}

export const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(function DrawingCanvas({
  shotId,
  tool,
  color,
  brushSize,
  opacity = 100,
  enablePressure = true,
  enableOpacityPressure = false,
  smoothness = 5,
  brushTexture = 'normal',
  arrowStyle = 'solid',
  stabilizer = 2,
  sizePressure = 0.95,
  opacityPressureStrength = 0,
  taperIn = 0,
  taperOut = 0,
  minSizeRatio = 0.08,
  density = 1,
  tipSpacing = 0.15,
  scatter = 0,
  hardness = 0.9,
  tipAngle = 0,
  speedTaper = false,
  watercolorEdge = false,
  edgeThickness = 6,
  edgeStrength = 18,
  edgeDarkness = 0,
  edgeBlur = 0,
  flow = 1,
  thickness = 1,
  sizeJitter = 0,
  angleJitter = 0,
  densityJitter = 0,
  tipSpacingAuto = false,
  directionMode = 'none',
  binarize = false,
  blendMode = 'normal',
  ribbon = false,
  ribbonCycle = 1,
  alternateSides = false,
  verticalThickness = false,
  tipFoilComposite = false,
  highSpeedTexture = false,
  textureStrength: textureStrengthProp = 0,
  shapeVariation = 0,
  tipImage = null,
  dualTipImage = null,
  texturePatternImage = null,
  psBrush = null,
  backgroundColor = '#ffffff',
  fillEdgeMode = 'match',
  fillEdgeWidth = 2,
  maxHistory = 20,
  pressureSizeCurve,
  onHistoryChange,
  onLayersChange,
  onColorSampled,
}: DrawingCanvasProps, ref) {
  const maxHistoryRef = useRef(maxHistory);
  maxHistoryRef.current = Math.max(5, Math.min(100, Math.round(maxHistory)));
  const fillEdgeWidthRef = useRef(fillEdgeWidth);
  fillEdgeWidthRef.current = fillEdgeWidth;
  const fillEdgeModeRef = useRef(fillEdgeMode);
  fillEdgeModeRef.current = fillEdgeMode;
  const backgroundColorRef = useRef(backgroundColor);
  backgroundColorRef.current = backgroundColor;
  const pressureSizeCurveRef = useRef(pressureSizeCurve);
  pressureSizeCurveRef.current = pressureSizeCurve;
  const lastSampleTimeRef = useRef(0);
  const lastSimPressureRef = useRef(0.5);
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Selection UI only — never composited into layer bitmaps / export. */
  const selectionOverlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const getShot = useProjectStore((state) => state.getShot);
  const updateShot = useProjectStore((state) => state.updateShot);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  type LayerBitmapSnap = { layerId: string; canvas: HTMLCanvasElement };
  const historyRef = useRef<LayerBitmapSnap[]>([]);
  const redoStackRef = useRef<LayerBitmapSnap[]>([]);
  const stabilizerFollowRef = useRef<{ x: number; y: number } | null>(null);
  const layersRuntimeRef = useRef<RuntimeDrawingLayer[]>([]);
  const activeLayerIdRef = useRef('');
  const layersReadyRef = useRef(false);
  const textLayerSnapshotRef = useRef<{ layerId: string; data: ImageData } | null>(null);
  const onLayersChangeRef = useRef(onLayersChange);
  onLayersChangeRef.current = onLayersChange;
  const onColorSampledRef = useRef(onColorSampled);
  onColorSampledRef.current = onColorSampled;
  const arrowStyleRef = useRef(arrowStyle);
  arrowStyleRef.current = arrowStyle;
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const twoFingerTapRef = useRef<{
    active: boolean;
    startTime: number;
    startPositions: Map<number, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);
  const [eyedropperPreview, setEyedropperPreview] = useState<{
    x: number;
    y: number;
    color: string;
  } | null>(null);
  const eyedropperPreviewTimerRef = useRef<number | null>(null);
  const isEyedroppingRef = useRef(false);
  const baseImageRef = useRef<string | null>(null); // ?????????????
  const lastPosRef = useRef<{ x: number; y: number; time: number } | null>(null); // ??????
  const currentPressureRef = useRef<number>(1);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tempCtxRef = useRef<CanvasRenderingContext2D | null>(null); // ????????
  const pathPointsRef = useRef<Array<{ x: number; y: number; pressure: number }>>([]);
  const strokeUsesDevicePressureRef = useRef(false);
  const arrowBaseImageDataRef = useRef<ImageData | null>(null); // ???????????????ImageData????????
  const brushBaseImageDataRef = useRef<ImageData | null>(null); // lasso / shapes cancel restore
  const spriteBrushBaseRef = useRef<ImageData | null>(null);
  /** GPU-friendly stroke cancel backup (drawImage, not getImageData). */
  const brushBackupCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Precomposed layers below / above active ??MoArt-like live present. */
  const strokeUnderlayRef = useRef<HTMLCanvasElement | null>(null);
  const strokeOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const strokeLivePresentRef = useRef(false);
  const strokeCursorRef = useRef<StrokeStampCursor>(createStrokeCursor());
  /** Full stroke points for taperOut restamp (not trimmed). */
  const strokeFullPointsRef = useRef<Array<{ x: number; y: number; pressure: number }>>([]);
  const penAngleDegRef = useRef(0);
  const presentRafRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [textInput, setTextInput] = useState<{ 
    x: number; 
    y: number; 
    text: string;
    fontSize: number;
    visible: boolean;
    isDragging: boolean;
    dragOffset: { x: number; y: number } | null;
  } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const textInputContainerRef = useRef<HTMLDivElement>(null);
  const textObjectsRef = useRef<Array<{
    id: string;
    x: number;
    y: number;
    text: string;
    fontSize: number;
    color: string;
    opacity: number;
    isSelected?: boolean;
    isDragging?: boolean;
    dragOffset?: { x: number; y: number };
  }>>([]); // ??????????
  const selectedTextIdRef = useRef<string | null>(null); // ???????ID

  const [canvasTransform, setCanvasTransform] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotation: 0,
  });
  const canvasTransformRef = useRef(canvasTransform);
  useEffect(() => {
    canvasTransformRef.current = canvasTransform;
  }, [canvasTransform]);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null); // ??????
  const isSpacePressedRef = useRef(false);
  const activePointersRef = useRef(
    new Map<number, { x: number; y: number }>()
  );
  const pinchGestureRef = useRef<{
    startDistance: number;
    startAngle: number;
    startScale: number;
    startRotation: number;
    contentAnchor: { x: number; y: number };
  } | null>(null);
  const isPinchingRef = useRef(false);
  const cancelActiveStrokeRef = useRef<(() => void) | null>(null);
  const undoFromGestureRef = useRef<(() => void) | null>(null);
  const drawingPointerIdRef = useRef<number | null>(null);

  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const lassoSelectionRef = useRef<FloatingSelection | null>(null);
  const selectionHoleRef = useRef<ImageData | null>(null);
  const selectionSpriteRef = useRef<HTMLCanvasElement | null>(null);
  /** Full layer bitmap before the selection hole was cut — restores pixel-perfect on cancel. */
  const selectionLayerBackupRef = useRef<HTMLCanvasElement | null>(null);
  /** Exact ImageData of the active layer at selection create (after preview restore). */
  const selectionPristineBackupRef = useRef<ImageData | null>(null);
  const selectionOriginRef = useRef<{
    minX: number;
    minY: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  /** True when floating sprite content differs from the original layer (fill / recolor). */
  const selectionMutatedContentRef = useRef(false);
  const selectionDashRef = useRef(0);
  const transformDragRef = useRef<{
    mode: TransformHandle;
    startX: number;
    startY: number;
    startBounds: SelectionBounds;
    startRotation: number;
    startAngle: number;
    startDist: number;
  } | null>(null);
  const layerDragRef = useRef<{ x: number; y: number; sprite: HTMLCanvasElement } | null>(null);
  const scaleDragRef = useRef<{
    cx: number;
    cy: number;
    dist: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  } | null>(null);
  const isLassoDrawingRef = useRef(false); // ????????
  const moveOffsetRef = useRef<{ x: number; y: number } | null>(null); // ????????
  const moveStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const moveBaseImageDataRef = useRef<ImageData | null>(null); // ???????????????

  const shot = getShot(shotId);
  const project = useProjectStore((state) => state.project);

  const showSafeFrame = useUIStore((state) => state.showSafeFrame);

  const notifyLayers = () => {
    onLayersChangeRef.current?.(serializeLayers(layersRuntimeRef.current), activeLayerIdRef.current);
  };

  const presentLayers = () => {
    const display = canvasRef.current;
    if (!display || layersRuntimeRef.current.length === 0) return;
    compositeRuntimeLayers(layersRuntimeRef.current, display);
  };
  const presentLayersRef = useRef(presentLayers);
  presentLayersRef.current = presentLayers;

  const persistLayers = () => {
    const display = canvasRef.current;
    if (!display || layersRuntimeRef.current.length === 0) return;
    presentLayers();
    // Export/composite from display only — overlay ants are never included
    const image = display.toDataURL('image/png');
    updateShot(shotId, {
      layers: serializeLayers(layersRuntimeRef.current),
      activeLayerId: activeLayerIdRef.current,
      image,
      imageSource: 'drawing',
    });
    redrawSelectionOverlay();
  };
  const persistLayersRef = useRef(persistLayers);
  persistLayersRef.current = persistLayers;

  const activeRuntimeLayer = () =>
    layersRuntimeRef.current.find((layer) => layer.id === activeLayerIdRef.current) ??
    layersRuntimeRef.current[layersRuntimeRef.current.length - 1];

  const syncSelectionOverlaySize = () => {
    const display = canvasRef.current;
    const overlay = selectionOverlayRef.current;
    if (!display || !overlay) return;
    if (overlay.width !== display.width || overlay.height !== display.height) {
      overlay.width = display.width;
      overlay.height = display.height;
    }
  };

  const clearSelectionOverlay = () => {
    const overlay = selectionOverlayRef.current;
    if (!overlay) return;
    const octx = overlay.getContext('2d');
    if (!octx) return;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
  };

  /** Draw ants / fill preview on the dedicated overlay canvas only. */
  const redrawSelectionOverlay = () => {
    syncSelectionOverlaySize();
    clearSelectionOverlay();
    const overlay = selectionOverlayRef.current;
    const sel = lassoSelectionRef.current;
    if (!overlay || !sel || isLassoDrawingRef.current) return;
    const octx = overlay.getContext('2d');
    if (!octx) return;
    const sprite = selectionSpriteRef.current;
    if (sprite && !selectionHoleRef.current && selectionMutatedContentRef.current) {
      drawTransformedSprite(octx, sprite, sel.bounds, sel.rotation);
    }
    paintSelectionOverlay(overlay, sel, selectionDashRef.current);
  };

  const clearSelectionState = () => {
    lassoSelectionRef.current = null;
    selectionHoleRef.current = null;
    selectionSpriteRef.current = null;
    selectionLayerBackupRef.current = null;
    selectionPristineBackupRef.current = null;
    selectionOriginRef.current = null;
    selectionMutatedContentRef.current = false;
    layerDragRef.current = null;
    clearSelectionOverlay();
  };

  /** Restore layer from pre-selection canvas clone (pixel-perfect, no ImageData round-trip). */
  const restoreSelectionBackup = () => {
    const backup = selectionLayerBackupRef.current;
    const pristine = selectionPristineBackupRef.current;
    const layer = activeRuntimeLayer();
    const layerCtx = layer?.canvas.getContext('2d');
    if (!layer || !layerCtx) return;
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (backup && backup.width === layer.canvas.width && backup.height === layer.canvas.height) {
      layerCtx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      layerCtx.drawImage(backup, 0, 0);
      return;
    }
    if (pristine && pristine.width === layer.canvas.width && pristine.height === layer.canvas.height) {
      layerCtx.putImageData(pristine, 0, 0);
    }
  };

  /**
   * Cancel / Escape: restore the pointer-down layer clone and wipe selection UI.
   * Selection chrome never touches the layer bitmap.
   */
  const discardFloatingSelection = () => {
    if (selectionLayerBackupRef.current || selectionPristineBackupRef.current) {
      restoreSelectionBackup();
    }
    clearSelectionState();
  };

  /**
   * Apply / deselect keeping content.
   * - Unmoved + no punch → drop UI only (layer already correct)
   * - Unmoved + punch + not mutated → restore backup (same pixels, zero fringe)
   * - Otherwise → hole + sprite (or punch-then-stamp for fill)
   */
  const commitFloatingSelection = () => {
    const sel = lassoSelectionRef.current;
    const sprite = selectionSpriteRef.current;
    const hole = selectionHoleRef.current;
    const backup = selectionLayerBackupRef.current;
    const layer = activeRuntimeLayer();
    const layerCtx = layer?.canvas.getContext('2d');
    const unmoved = sel ? selectionUntransformed(sel, selectionOriginRef.current) : true;
    const mutated = selectionMutatedContentRef.current;

    if (sel && sprite && layerCtx && layer) {
      if (!hole) {
        if (mutated) {
          // Record undo once when fill is baked in
          const snap = document.createElement('canvas');
          snap.width = layer.canvas.width;
          snap.height = layer.canvas.height;
          snap.getContext('2d')?.drawImage(layer.canvas, 0, 0);
          historyRef.current.push({ layerId: layer.id, canvas: snap });
          trimHistoryStacks();
          redoStackRef.current = [];
          emitHistory();
          cutHoleMatchingSprite(layerCtx, sprite, Math.round(sel.bounds.minX), Math.round(sel.bounds.minY));
          drawTransformedSprite(layerCtx, sprite, sel.bounds, sel.rotation);
        } else {
          // Unmoved select/lasso: force pristine restore so any accidental pixels are gone
          restoreSelectionBackup();
        }
      } else if (unmoved && !mutated) {
        restoreSelectionBackup();
      } else {
        layerCtx.putImageData(hole, 0, 0);
        drawTransformedSprite(layerCtx, sprite, sel.bounds, sel.rotation);
      }
    } else if (selectionPristineBackupRef.current || backup) {
      restoreSelectionBackup();
    }
    clearSelectionState();
  };

  const getDefaultContentSize = () => {
    const longEdge = 1920;
    const ratio = project?.aspectRatio || '16:9';
    const [wStr, hStr] = ratio.split(':');
    const w = parseFloat(wStr || '16');
    const h = parseFloat(hStr || '9');
    if (!w || !h) {
      return { width: longEdge, height: Math.round((longEdge * 9) / 16) };
    }
    if (w >= h) {
      return { width: longEdge, height: Math.max(1, Math.round((longEdge * h) / w)) };
    }
    return { width: Math.max(1, Math.round((longEdge * w) / h)), height: longEdge };
  };

  /** ??????????????????????????*/
  const exportContent = (canvas: HTMLCanvasElement): string => {
    return canvas.toDataURL('image/png');
  };

  /** 1:1 ???????????????? */
  const drawBitmap1x1 = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    img: HTMLImageElement
  ) => {
    if (canvas.width !== img.width || canvas.height !== img.height) {
      canvas.width = img.width;
      canvas.height = img.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };

  const fitCanvasToContainer = () => {
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    if (!containerWidth || !containerHeight || !canvas.width || !canvas.height) return;
    const scale = Math.min(containerWidth / canvas.width, containerHeight / canvas.height) * 0.9;
    setCanvasTransform({
      scale,
      translateX: (containerWidth - canvas.width * scale) / 2,
      translateY: (containerHeight - canvas.height * scale) / 2,
      rotation: 0,
    });
  };

  const emitHistory = () => {
    onHistoryChange?.({
      canUndo: historyRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
    });
  };

  const cloneLayerCanvas = (source: HTMLCanvasElement) => {
    const c = document.createElement('canvas');
    c.width = source.width;
    c.height = source.height;
    c.getContext('2d')?.drawImage(source, 0, 0);
    return c;
  };

  const restoreLayerSnapshot = (layerId: string, snap: HTMLCanvasElement) => {
    const layer = layersRuntimeRef.current.find((item) => item.id === layerId) ?? activeRuntimeLayer();
    if (!layer) return;
    const ctx = layer.canvas.getContext('2d');
    if (!ctx) return;
    if (layer.canvas.width !== snap.width || layer.canvas.height !== snap.height) {
      layer.canvas.width = snap.width;
      layer.canvas.height = snap.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.drawImage(snap, 0, 0);
    persistLayers();
  };

  const snapshotActiveLayer = (): LayerBitmapSnap | null => {
    const layer = activeRuntimeLayer();
    if (!layer) return null;
    return { layerId: layer.id, canvas: cloneLayerCanvas(layer.canvas) };
  };

  const trimHistoryStacks = () => {
    const cap = maxHistoryRef.current;
    while (historyRef.current.length > cap) historyRef.current.shift();
    while (redoStackRef.current.length > cap) redoStackRef.current.shift();
  };

  const performUndo = () => {
    if (historyRef.current.length === 0) return;
    const current = snapshotActiveLayer();
    const prevState = historyRef.current.pop();
    if (!prevState) return;
    if (current) {
      redoStackRef.current.push(current);
      trimHistoryStacks();
    }
    restoreLayerSnapshot(prevState.layerId, prevState.canvas);
    emitHistory();
  };
  undoFromGestureRef.current = performUndo;

  useEffect(() => {
    trimHistoryStacks();
    emitHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxHistory]);

  // ?? undo / redo / clearCanvas ??????
  useImperativeHandle(ref, () => ({
    undo: () => {
      performUndo();
    },
    redo: () => {
      if (redoStackRef.current.length === 0) return;
      const current = snapshotActiveLayer();
      const nextState = redoStackRef.current.pop();
      if (!nextState) return;
      if (current) {
        historyRef.current.push(current);
        trimHistoryStacks();
      }
      restoreLayerSnapshot(nextState.layerId, nextState.canvas);
      emitHistory();
    },
    clearCanvas: () => {
      textObjectsRef.current = [];
      selectedTextIdRef.current = null;
      setTextInput(null);
      historyRef.current = [];
      redoStackRef.current = [];
      const layer = activeRuntimeLayer();
      if (layer) {
        if (layer.role === 'background') fillCanvas(layer.canvas, '#ffffff');
        else fillCanvas(layer.canvas, null);
        persistLayers();
      }
      emitHistory();
    },
    resetView: () => {
      setCanvasTransform({
        scale: 1,
        translateX: 0,
        translateY: 0,
        rotation: 0,
      });
    },
    fitToScreen: () => {
      fitCanvasToContainer();
    },
    getTransform: () => canvasTransform,
    selectLayer: (id: string) => {
      if (!layersRuntimeRef.current.some((layer) => layer.id === id)) return;
      if (id !== activeLayerIdRef.current && lassoSelectionRef.current) {
        commitFloatingSelection();
        presentLayers();
        persistLayers();
      }
      activeLayerIdRef.current = id;
      const layer = layersRuntimeRef.current.find((item) => item.id === id);
      if (layer && !layer.visible) {
        layer.visible = true;
        presentLayers();
        persistLayers();
      }
      notifyLayers();
    },
    addLayer: () => {
      const base = layersRuntimeRef.current[0];
      if (!base) return;
      const maxOrder = Math.max(...layersRuntimeRef.current.map((l) => l.order), 0);
      const layer = createEmptyLayer(
        base.canvas.width,
        base.canvas.height,
        layersRuntimeRef.current.length + 1,
        maxOrder + 1
      );
      layersRuntimeRef.current.push(layer);
      activeLayerIdRef.current = layer.id;
      presentLayers();
      persistLayers();
      notifyLayers();
    },
    deleteLayer: (id: string) => {
      const layer = layersRuntimeRef.current.find((item) => item.id === id);
      if (!layer || layer.role === 'background' || layersRuntimeRef.current.length <= 1) return;
      layersRuntimeRef.current = layersRuntimeRef.current.filter((item) => item.id !== id);
      if (activeLayerIdRef.current === id) {
        activeLayerIdRef.current = layersRuntimeRef.current[layersRuntimeRef.current.length - 1].id;
      }
      presentLayers();
      persistLayers();
      notifyLayers();
    },
    toggleLayerVisible: (id: string) => {
      const layer = layersRuntimeRef.current.find((item) => item.id === id);
      if (!layer) return;
      layer.visible = !layer.visible;
      presentLayers();
      persistLayers();
      notifyLayers();
    },
    clearSelection: () => {
      discardFloatingSelection();
      presentLayers();
      clearSelectionOverlay();
      persistLayers();
    },
    reorderLayers: (orderedIdsBottomToTop: string[]) => {
      const map = new Map(layersRuntimeRef.current.map((l) => [l.id, l]));
      const next: RuntimeDrawingLayer[] = [];
      orderedIdsBottomToTop.forEach((id, index) => {
        const layer = map.get(id);
        if (layer) {
          layer.order = index;
          next.push(layer);
          map.delete(id);
        }
      });
      map.forEach((layer) => {
        layer.order = next.length;
        next.push(layer);
      });
      layersRuntimeRef.current = next;
      presentLayers();
      persistLayers();
      notifyLayers();
    },
    setLayerOpacity: (id: string, nextOpacity: number) => {
      const layer = layersRuntimeRef.current.find((item) => item.id === id);
      if (!layer) return;
      layer.opacity = Math.min(100, Math.max(0, nextOpacity));
      presentLayers();
      persistLayers();
      notifyLayers();
    },
    setLayerBlendMode: (id: string, mode: LayerBlendMode) => {
      const layer = layersRuntimeRef.current.find((item) => item.id === id);
      if (!layer) return;
      layer.blendMode = mode;
      presentLayers();
      persistLayers();
      notifyLayers();
    },
  }), [shotId, updateShot, onHistoryChange, canvasTransform]);

  // ???????? shotId ??????
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !shot) return;
    let cancelled = false;
    layersReadyRef.current = false;
    const size = getDefaultContentSize();
    const hadLayers = Boolean(shot.layers && shot.layers.length > 0);
    buildInitialLayers(shot.layers, shot.image, size).then((runtime) => {
      if (cancelled || !canvasRef.current) return;
      clearSelectionState();
      layersRuntimeRef.current = runtime;
      const preferred = shot.activeLayerId;
      activeLayerIdRef.current =
        preferred && runtime.some((layer) => layer.id === preferred)
          ? preferred
          : runtime[runtime.length - 1].id;
      presentLayers();
      baseImageRef.current = canvasRef.current.toDataURL('image/png');
      historyRef.current = [];
      redoStackRef.current = [];
      onHistoryChange?.({ canUndo: false, canRedo: false });
      layersReadyRef.current = true;
      if (tempCanvasRef.current) {
        tempCanvasRef.current.width = canvasRef.current.width;
        tempCanvasRef.current.height = canvasRef.current.height;
      }
      fitCanvasToContainer();
      if (!hadLayers) persistLayers();
      notifyLayers();
    });
    return () => {
      cancelled = true;
    };
  }, [shotId, shot?.id]);

  // ????????????
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !shot) return;

    const displayCanvas = canvasRef.current;
    let canvas = displayCanvas;
    const initialCtx = displayCanvas.getContext('2d');
    if (!initialCtx) return;
    let ctx: CanvasRenderingContext2D = initialCtx;

    const bindActiveSurface = () => {
      const layer = layersRuntimeRef.current.find((item) => item.id === activeLayerIdRef.current)
        ?? layersRuntimeRef.current[layersRuntimeRef.current.length - 1];
      if (!layer) {
        canvas = displayCanvas;
        ctx = displayCanvas.getContext('2d') || ctx;
        return;
      }
      canvas = layer.canvas;
      ctx = layer.canvas.getContext('2d') || ctx;
    };
    const ensureScratch = (
      ref: { current: HTMLCanvasElement | null },
      w: number,
      h: number
    ) => {
      let c = ref.current;
      if (!c) {
        c = document.createElement('canvas');
        ref.current = c;
      }
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      return c;
    };

    const layerCompositeOp = (blend: LayerBlendMode | undefined): GlobalCompositeOperation =>
      blend === 'multiply'
        ? 'multiply'
        : blend === 'screen'
          ? 'screen'
          : blend === 'overlay'
            ? 'overlay'
            : blend === 'darken'
              ? 'darken'
              : blend === 'lighten'
                ? 'lighten'
                : 'source-over';

    /** Split layers below/above active once per stroke. */
    const rebuildStrokeUnderlay = () => {
      const activeId = activeLayerIdRef.current;
      const layers = layersRuntimeRef.current;
      if (layers.length === 0) return;
      const w = layers[0].canvas.width;
      const h = layers[0].canvas.height;
      const under = ensureScratch(strokeUnderlayRef, w, h);
      const over = ensureScratch(strokeOverlayRef, w, h);
      const uctx = under.getContext('2d');
      const octx = over.getContext('2d');
      if (!uctx || !octx) return;
      uctx.setTransform(1, 0, 0, 1, 0, 0);
      uctx.clearRect(0, 0, w, h);
      uctx.fillStyle = '#ffffff';
      uctx.fillRect(0, 0, w, h);
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, w, h);
      const sorted = [...layers].sort((a, b) => a.order - b.order);
      const activeOrder =
        sorted.find((l) => l.id === activeId)?.order ?? Number.POSITIVE_INFINITY;
      for (const layer of sorted) {
        if (!layer.visible || layer.id === activeId) continue;
        const target = layer.order < activeOrder ? uctx : octx;
        target.save();
        target.globalAlpha = (layer.opacity ?? 100) / 100;
        target.globalCompositeOperation = layerCompositeOp(layer.blendMode);
        target.drawImage(layer.canvas, 0, 0, w, h);
        target.restore();
      }
    };

    /** Live brush present: underlay + active + overlay (3 blits / frame). */
    const presentStrokeLive = () => {
      const under = strokeUnderlayRef.current;
      const over = strokeOverlayRef.current;
      const active = layersRuntimeRef.current.find((l) => l.id === activeLayerIdRef.current);
      if (!under || !active) {
        presentLayersRef.current();
        return;
      }
      const dctx = displayCanvas.getContext('2d');
      if (!dctx) return;
      const w = displayCanvas.width;
      const h = displayCanvas.height;
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.clearRect(0, 0, w, h);
      dctx.drawImage(under, 0, 0);
      dctx.save();
      dctx.globalAlpha = (active.opacity ?? 100) / 100;
      dctx.globalCompositeOperation = layerCompositeOp(active.blendMode);
      dctx.drawImage(active.canvas, 0, 0, w, h);
      dctx.restore();
      if (over) dctx.drawImage(over, 0, 0);
      redrawSelectionOverlay();
    };

    const present = () => {
      if (strokeLivePresentRef.current) {
        presentStrokeLive();
        return;
      }
      presentLayersRef.current();
      redrawSelectionOverlay();
    };
    const blitFloatingSelection = () => {
      const sel = lassoSelectionRef.current;
      const sprite = selectionSpriteRef.current;
      const hole = selectionHoleRef.current;
      if (!sel || !sprite) {
        present();
        return;
      }
      // Only rewrite the layer when a hole has been punched (after transform)
      if (hole) {
        ctx.putImageData(hole, 0, 0);
        drawTransformedSprite(ctx, sprite, sel.bounds, sel.rotation);
      }
      present();
    };

    /** Punch hole the first time the selection is moved/transformed. */
    const ensureSelectionPunched = () => {
      const sel = lassoSelectionRef.current;
      const sprite = selectionSpriteRef.current;
      if (!sel || !sprite || !canvas || !ctx || selectionHoleRef.current) return;
      if (!selectionLayerBackupRef.current) {
        selectionLayerBackupRef.current = cloneCanvas(canvas);
      }
      if (!selectionPristineBackupRef.current) {
        selectionPristineBackupRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
      saveStateToHistory();
      cutHoleMatchingSprite(ctx, sprite, Math.round(sel.bounds.minX), Math.round(sel.bounds.minY));
      selectionHoleRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    const extractSelection = () => {
      const sel = lassoSelectionRef.current;
      if (!sel || !canvas || !ctx || selectionSpriteRef.current) return;
      const pts = selectionOutline(sel);
      if (pts.length < 3) return;
      const minX = Math.floor(Math.min(...pts.map((point) => point.x)));
      const minY = Math.floor(Math.min(...pts.map((point) => point.y)));
      const maxX = Math.ceil(Math.max(...pts.map((point) => point.x)));
      const maxY = Math.ceil(Math.max(...pts.map((point) => point.y)));
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      selectionLayerBackupRef.current = cloneCanvas(canvas);
      selectionPristineBackupRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const sprite = document.createElement('canvas');
      sprite.width = width;
      sprite.height = height;
      const spriteCtx = sprite.getContext('2d');
      if (!spriteCtx) return;
      spriteCtx.imageSmoothingEnabled = false;
      spriteCtx.beginPath();
      spriteCtx.moveTo(pts[0].x - minX, pts[0].y - minY);
      for (let i = 1; i < pts.length; i++) spriteCtx.lineTo(pts[i].x - minX, pts[i].y - minY);
      spriteCtx.closePath();
      spriteCtx.clip();
      spriteCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
      // Defer hole cut until transform — cancel leaves layer untouched
      selectionSpriteRef.current = sprite;
      sel.bounds = { minX, minY, maxX, maxY, width, height };
      sel.rotation = 0;
      sel.localPoints = pts.map((point) => ({
        x: (point.x - minX) / width,
        y: (point.y - minY) / height,
      }));
      sel.points = pts;
      selectionOriginRef.current = { minX, minY, width, height, rotation: 0 };
      selectionMutatedContentRef.current = false;
      selectionHoleRef.current = null;
    };
    const beginTransform = (x: number, y: number, mode: TransformHandle) => {
      const sel = lassoSelectionRef.current;
      if (!sel) return;
      if (!selectionSpriteRef.current) extractSelection();
      ensureSelectionPunched();
      blitFloatingSelection();
      const current = lassoSelectionRef.current;
      if (!current) return;
      const center = selectionCenter(current.bounds);
      transformDragRef.current = {
        mode,
        startX: x,
        startY: y,
        startBounds: { ...current.bounds },
        startRotation: current.rotation,
        startAngle: Math.atan2(y - center.y, x - center.x),
        startDist: Math.max(12, Math.hypot(x - center.x, y - center.y)),
      };
      isDrawingRef.current = true;
    };

    // restored
    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
      tempCanvasRef.current.width = canvas.width || containerRef.current.clientWidth;
      tempCanvasRef.current.height = canvas.height || containerRef.current.clientHeight;
      tempCtxRef.current = tempCanvasRef.current.getContext('2d');
    } else {
      // restored
      if (tempCanvasRef.current.width !== canvas.width || tempCanvasRef.current.height !== canvas.height) {
        tempCanvasRef.current.width = canvas.width;
        tempCanvasRef.current.height = canvas.height;
      }
    }

    const saveStateToHistory = () => {
      bindActiveSurface();
      if (!canvas || !ctx) return;
      const snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d')?.drawImage(canvas, 0, 0);
      historyRef.current.push({
        layerId: activeLayerIdRef.current,
        canvas: snap,
      });
      const cap = maxHistoryRef.current;
      while (historyRef.current.length > cap) historyRef.current.shift();
      redoStackRef.current = [];
      onHistoryChange?.({
        canUndo: historyRef.current.length > 0,
        canRedo: false,
      });
    };


    const handleResize = () => {
      fitCanvasToContainer();
    };

    window.addEventListener('resize', handleResize);

    const getScaledCoordinates = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!canvasRef.current || !containerRef.current) {
        return { x: 0, y: 0, pressure: 1 };
      }

      const canvas = canvasRef.current;
      const container = containerRef.current;
      let clientX: number;
      let clientY: number;

      if (e instanceof PointerEvent || e instanceof MouseEvent) {
        clientX = e.clientX;
        clientY = e.clientY;
      } else {
        clientX = e.touches[0]?.clientX || 0;
        clientY = e.touches[0]?.clientY || 0;
      }

      const { pressure } = resolveStrokePressure(e, strokeUsesDevicePressureRef.current);
      const t = canvasTransformRef.current;
      const crect = container.getBoundingClientRect();
      if (crect.width <= 0 || crect.height <= 0 || !t.scale) {
        return { x: 0, y: 0, pressure };
      }

      const vv = window.visualViewport;
      const native = document.documentElement.classList.contains('native-app');
      const layoutX = native && vv ? clientX + vv.offsetLeft : clientX;
      const layoutY = native && vv ? clientY + vv.offsetTop : clientY;
      const zoomX = container.clientWidth > 0 ? crect.width / container.clientWidth : 1;
      const zoomY = container.clientHeight > 0 ? crect.height / container.clientHeight : 1;

      // restored
      let sx = (layoutX - crect.left) / zoomX - t.translateX;
      let sy = (layoutY - crect.top) / zoomY - t.translateY;
      if (Math.abs(t.rotation) >= 0.01) {
        const rad = (-t.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = sx * cos - sy * sin;
        const ry = sx * sin + sy * cos;
        sx = rx;
        sy = ry;
      }

      const cssW = canvas.clientWidth || canvas.width;
      const cssH = canvas.clientHeight || canvas.height;
      return {
        x: (sx / t.scale) * (canvas.width / cssW),
        y: (sy / t.scale) * (canvas.height / cssH),
        pressure,
      };
    };

    const cancelActiveStroke = () => {
      if (!isDrawingRef.current && pathPointsRef.current.length === 0) return;
      bindActiveSurface();
      if (presentRafRef.current != null) {
        cancelAnimationFrame(presentRafRef.current);
        presentRafRef.current = null;
      }
      strokeLivePresentRef.current = false;
      const backup = brushBackupCanvasRef.current;
      if (backup && canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(backup, 0, 0);
      } else if (brushBaseImageDataRef.current) {
        ctx.putImageData(brushBaseImageDataRef.current, 0, 0);
      } else if (arrowBaseImageDataRef.current) {
        ctx.putImageData(arrowBaseImageDataRef.current, 0, 0);
      }
      present();
      isDrawingRef.current = false;
      isLassoDrawingRef.current = false;
      startPosRef.current = null;
      lastPosRef.current = null;
      pathPointsRef.current = [];
      brushBaseImageDataRef.current = null;
      brushBackupCanvasRef.current = null;
      arrowBaseImageDataRef.current = null;
      currentPressureRef.current = 1;
      strokeUsesDevicePressureRef.current = false;
      drawingPointerIdRef.current = null;
      strokeCursorRef.current = createStrokeCursor();
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Drop history snapshot written at stroke start (avoid empty undo from multi-touch)
      if (historyRef.current.length > 0) {
        historyRef.current.pop();
        onHistoryChange?.({
          canUndo: historyRef.current.length > 0,
          canRedo: redoStackRef.current.length > 0,
        });
      }
    };
    cancelActiveStrokeRef.current = cancelActiveStroke;

    const applyStyle = () => {
      return color;
    };

    const mapPressureSize = (p: number) =>
      evaluatePressureCurve(p, pressureSizeCurveRef.current);

    const getEffectiveBrushSize = (pressure: number = 0.5): number => {
      const floor = brushSize * Math.min(1, Math.max(0.05, minSizeRatio));
      if (!enablePressure || !strokeUsesDevicePressureRef.current || sizePressure <= 0) {
        return brushSize;
      }
      const clamped = mapPressureSize(Math.max(0, Math.min(1, pressure)));
      const factor = 1 - sizePressure + sizePressure * (0.15 + clamped * 1.35);
      return Math.max(floor, brushSize * factor);
    };

    const getEffectiveOpacity = (pressure: number = 1): number => {
      if (!enableOpacityPressure) return opacity;
      const strength = Math.max(0.35, opacityPressureStrength > 0.05 ? opacityPressureStrength : 0.85);
      const clamped = Math.max(0, Math.min(1, pressure));
      const curved = Math.pow(clamped, 1.25);
      const factor = 1 - strength + strength * (0.04 + curved * 0.96);
      return opacity * Math.max(0.02, factor);
    };

    /** Base stroke alpha only ??per-dab opacity pressure is applied in stampStrokeSegment. */
    const brushAlpha = () => {
      let alpha = opacity / 100;
      if (brushTexture === 'marker') alpha *= 0.42;
      else if (brushTexture === 'pencil') alpha *= 0.88;
      return Math.max(0.02, Math.min(1, alpha));
    };

    const stabilizePoint = (x: number, y: number) => {
      // PS Smoothing: stronger lag when ps.smoothing.enabled
      let amount = Math.min(10, Math.max(0, stabilizer));
      if (psBrush?.smoothing.enabled) {
        amount = Math.max(amount, (psBrush.smoothing.strengthPercent / 100) * 8);
      }
      if (amount <= 0) {
        stabilizerFollowRef.current = { x, y };
        return { x, y };
      }
      // Catch-up style lag (closer to PS stroke smoothing than plain EMA)
      const pull = 1 / (1 + amount * 0.7);
      const prev = stabilizerFollowRef.current;
      if (!prev) {
        stabilizerFollowRef.current = { x, y };
        return { x, y };
      }
      const nx = prev.x + (x - prev.x) * pull;
      const ny = prev.y + (y - prev.y) * pull;
      stabilizerFollowRef.current = { x: nx, y: ny };
      return { x: nx, y: ny };
    };

    const selectionWorldPoints = () => {
      const sel = lassoSelectionRef.current;
      if (!sel || sel.localPoints.length < 3) return null;
      return sel.localPoints.map((lp) => worldFromLocal(sel.bounds, sel.rotation, lp.x, lp.y));
    };

    const withPaintClip = (drawFn: () => void) => {
      const pts = selectionWorldPoints();
      if (!pts) {
        drawFn();
        return;
      }
      ctx.save();
      clipToPolygon(ctx, pts);
      drawFn();
      ctx.restore();
    };

    const buildStrokeOpts = (alpha: number, erase = false) => {
      const isSpray = brushTexture === 'airbrush';
      // Sampled tip / PS brush: honor hardness as-is (don't soft-clamp)
      const hard = tipImage || psBrush
        ? hardness
        : brushTexture === 'hard' || brushTexture === 'normal'
          ? Math.max(hardness, 0.75)
          : brushTexture === 'soft'
            ? Math.min(hardness, 0.35)
            : brushTexture === 'pencil'
              ? 0.55
              : brushTexture === 'marker'
                ? 0.7
                : isSpray
                  ? Math.min(hardness, 0.15)
                  : hardness;
      const spacing = tipSpacingAuto
        ? isSpray
          ? 0.18
          : Math.max(0.12, 0.28 - sizePressure * 0.08)
        : tipSpacing;
      // User textureStrength wins; else pencil / high-speed defaults
      const textureStrength =
        textureStrengthProp > 0.02
          ? textureStrengthProp
          : highSpeedTexture || brushTexture === 'pencil'
            ? Math.max(highSpeedTexture ? 0.55 : 0, brushTexture === 'pencil' ? 0.4 : 0)
            : 0;
      const opPressure = erase
        ? 0
        : enableOpacityPressure
          ? Math.max(0.35, opacityPressureStrength > 0.05 ? opacityPressureStrength : 0.85)
          : 0;
      const effectiveFlow =
        opPressure > 0.05
          ? Math.min(flow, Math.max(0.12, flow * (0.22 + (1 - opPressure) * 0.35)))
          : flow;
      // Size pressure only for real stylus. Mouse/finger used velocity-sim pressure before,
      // which made Android touch strokes look thinner/thicker than desktop at the same slider.
      const applySizePressure =
        enablePressure && strokeUsesDevicePressureRef.current && sizePressure > 0;
      const base = {
        color,
        size: brushSize,
        alpha: erase
          ? Math.min(1, opacity / 100)
          : Math.min(1, alpha * (brushTexture === 'marker' ? 0.55 : 1)),
        sizePressure: applySizePressure ? sizePressure : 0,
        opacityPressure: opPressure,
        minSizeRatio,
        pressureSizeMap: applySizePressure ? mapPressureSize : undefined,
        tipSpacing: spacing,
        scatter: isSpray ? Math.max(scatter, 0.4) : scatter,
        hardness: hard,
        density,
        tipAngleDeg: tipAngle,
        sizeJitter: Math.max(sizeJitter, shapeVariation * 0.5),
        angleJitter,
        densityJitter,
        flow: effectiveFlow,
        spray: isSpray,
        tipImage: tipImage ?? null,
        roundness: Math.max(0.08, Math.min(1, thickness)),
        verticalScale: verticalThickness ? 0.55 : 1,
        directionMode,
        penAngleDeg: penAngleDegRef.current,
        taperIn,
        taperOut: 0, // applied on finalize restamp
        blendMode,
        binarize,
        textureStrength,
        erase,
        wetEdge: watercolorEdge,
        edgeThickness,
        edgeStrength,
        edgeDarkness,
        ribbon,
        ribbonCycle,
        alternateSides,
        shapeVariation,
        tipFoilComposite,
      };
      if (!psBrush || erase) return base;
      const psPartial = psSettingsToStrokePartial(psBrush, {
        // Only fall back to main tip when dual is actually enabled for this brush
        dualTip: dualTipImage ?? (psBrush.dualBrush.enabled ? tipImage : null),
        texturePattern: psBrush.texture.enabled ? texturePatternImage : null,
      });
      // Merge: skip undefined so PS never blanks legacy pressure/flow
      const merged = { ...base };
      for (const [k, v] of Object.entries(psPartial)) {
        if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
      }
      // Keep live UI size / color / erase / tip; PS tipShape.sizePx is default-only
      merged.color = base.color;
      merged.size = base.size;
      merged.alpha = base.alpha;
      merged.erase = base.erase;
      merged.tipImage = base.tipImage;
      merged.taperIn = base.taperIn;
      merged.taperOut = base.taperOut;
      merged.spray = base.spray;
      if (!applySizePressure) merged.sizePressure = 0;
      else if (psPartial.sizePressure == null) merged.sizePressure = base.sizePressure;
      // Sampled ABR tip: don't let soft-texture hardness clamp fight the bitmap
      if (base.tipImage) {
        merged.hardness = psPartial.hardness ?? base.hardness;
      }
      // Misc toggles always come from the brush preset (never leave legacy defaults on)
      merged.wetEdge = Boolean(psBrush.misc.wetEdges);
      merged.noise = Boolean(psBrush.misc.noise);
      merged.buildUp = Boolean(psBrush.misc.buildUp);
      if (!psBrush.dualBrush.enabled) merged.dual = null;
      if (!psBrush.texture.enabled) {
        merged.psTexture = null;
        merged.textureStrength = 0;
      }
      if (!psBrush.scattering.enabled) {
        merged.scatter = 0;
        merged.scatterCount = 1;
      }
      return merged;
    };

    const schedulePresent = () => {
      if (presentRafRef.current != null) return;
      presentRafRef.current = requestAnimationFrame(() => {
        presentRafRef.current = null;
        if (lassoSelectionRef.current) blitFloatingSelection();
        else present();
      });
    };

    /** Incremental dab ? brush or eraser (erase uses same tip via destination-out). */
    const paintBrushDab = (sx: number, sy: number, pressure: number, erase = false) => {
      bindActiveSurface();
      if (!canvas || !ctx) return;
      const alpha = brushAlpha();
      const opts = buildStrokeOpts(alpha, erase);
      const sel = lassoSelectionRef.current;
      const sprite = selectionSpriteRef.current;

      if (sel && sprite && sel.rotation === 0) {
        const sctx = sprite.getContext('2d');
        if (!sctx) return;
        const lx = sx - sel.bounds.minX;
        const ly = sy - sel.bounds.minY;
        sctx.save();
        clipToPolygon(
          sctx,
          sel.localPoints.map((lp) => ({
            x: lp.x * sel.bounds.width,
            y: lp.y * sel.bounds.height,
          }))
        );
        stampStrokeSegment(sctx, strokeCursorRef.current, lx, ly, pressure, opts);
        sctx.restore();
        schedulePresent();
        return;
      }

      withPaintClip(() => {
        stampStrokeSegment(ctx, strokeCursorRef.current, sx, sy, pressure, opts);
      });
      schedulePresent();
    };


    /** Map layer/canvas coords ? viewport so the swatch sits beside the tip. */
    const canvasPointToClient = (sx: number, sy: number) => {
      const display = canvasRef.current;
      if (!display) return { clientX: 0, clientY: 0 };
      const rect = display.getBoundingClientRect();
      const scaleX = rect.width / Math.max(1, display.width);
      const scaleY = rect.height / Math.max(1, display.height);
      return {
        clientX: rect.left + sx * scaleX,
        clientY: rect.top + sy * scaleY,
      };
    };

    const sampleColorAt = (
      sx: number,
      sy: number,
      ev?: MouseEvent | TouchEvent | PointerEvent,
      opts?: { persistPreview?: boolean; clientX?: number; clientY?: number }
    ) => {
      const display = canvasRef.current;
      if (!display) return;
      presentLayersRef.current();
      const dctx = display.getContext('2d');
      if (!dctx) return;
      const px = Math.max(0, Math.min(display.width - 1, Math.floor(sx)));
      const py = Math.max(0, Math.min(display.height - 1, Math.floor(sy)));
      const data = dctx.getImageData(px, py, 1, 1).data;
      const hex =
        '#' +
        [data[0], data[1], data[2]]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
      onColorSampledRef.current?.(hex);

      let clientX = opts?.clientX;
      let clientY = opts?.clientY;
      if (clientX == null || clientY == null) {
        if (ev instanceof PointerEvent || ev instanceof MouseEvent) {
          clientX = ev.clientX;
          clientY = ev.clientY;
        } else if (ev && 'touches' in ev && ev.touches[0]) {
          clientX = ev.touches[0].clientX;
          clientY = ev.touches[0].clientY;
        } else {
          const mapped = canvasPointToClient(sx, sy);
          clientX = mapped.clientX;
          clientY = mapped.clientY;
        }
      }
      // Sit just beside the tip (not centered on it)
      setEyedropperPreview({ x: clientX + 18, y: clientY - 14, color: hex });
      if (eyedropperPreviewTimerRef.current != null) {
        window.clearTimeout(eyedropperPreviewTimerRef.current);
        eyedropperPreviewTimerRef.current = null;
      }
      if (!opts?.persistPreview) {
        eyedropperPreviewTimerRef.current = window.setTimeout(() => {
          setEyedropperPreview(null);
          eyedropperPreviewTimerRef.current = null;
        }, 700);
      }
      bindActiveSurface();
    };

    const clearLongPress = () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressOriginRef.current = null;
    };

    const startDrawing = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!layersReadyRef.current) return;
      bindActiveSurface();
      if (!canvas || !ctx) return;
      // ?? / ????????
      if (
        isPanningRef.current ||
        isSpacePressedRef.current ||
        isPinchingRef.current ||
        activePointersRef.current.size > 1
      ) {
        return;
      }
      if (e instanceof PointerEvent && !e.isPrimary) {
        return;
      }
      // Prevent pointerdown + synthetic mousedown from resetting an in-progress stroke
      if (
        isDrawingRef.current &&
        drawingPointerIdRef.current !== null &&
        (!(e instanceof PointerEvent) || e.pointerId === drawingPointerIdRef.current)
      ) {
        return;
      }

      isDrawingRef.current = true;
      longPressFiredRef.current = false;
      clearLongPress();
      if (e instanceof PointerEvent) {
        drawingPointerIdRef.current = e.pointerId;
        try {
          (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
        } catch {
          /* capture unsupported */
        }
      }
      const { x, y } = getScaledCoordinates(e);

      // ?????????????? 400ms ??????
      if (
        tool !== 'eyedropper' &&
        tool !== 'text' &&
        tool !== 'select' &&
        tool !== 'lasso' &&
        tool !== 'lassoFill' &&
        tool !== 'move' &&
        tool !== 'scale'
      ) {
        let clientX = 0;
        let clientY = 0;
        if (e instanceof PointerEvent || e instanceof MouseEvent) {
          clientX = e.clientX;
          clientY = e.clientY;
        } else if ('touches' in e && e.touches[0]) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        }
        longPressOriginRef.current = { x, y, clientX, clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          const origin = longPressOriginRef.current;
          if (!origin) return;
          // If the user already drew a path, this was a stroke — don't steal it for eyedropper.
          const drawn =
            strokeFullPointsRef.current.length > 1 ||
            (lastPosRef.current != null &&
              Math.hypot(lastPosRef.current.x - origin.x, lastPosRef.current.y - origin.y) > 3);
          if (drawn) {
            clearLongPress();
            return;
          }
          longPressFiredRef.current = true;
          cancelActiveStroke();
          isEyedroppingRef.current = true;
          sampleColorAt(origin.x, origin.y, undefined, {
            clientX: origin.clientX,
            clientY: origin.clientY,
            persistPreview: true,
          });
          clearLongPress();
        }, LONG_PRESS_MS);
      }
      const resolved = resolveStrokePressure(e, false);
      const wantsPressure = enablePressure || enableOpacityPressure;
      strokeUsesDevicePressureRef.current = wantsPressure && resolved.hasDevicePressure;
      const effectivePressure = wantsPressure ? resolved.pressure : 0.5;
      currentPressureRef.current = effectivePressure;
      const penAng = resolvePenAngleDeg(e);
      if (penAng != null) penAngleDegRef.current = penAng;

      startPosRef.current = { x, y };
      lastPosRef.current = { x, y, time: Date.now() };

      const paintTools =
        tool === 'brush' ||
        tool === 'eraser' ||
        tool === 'arrow' ||
        tool === 'line' ||
        tool === 'text' ||
        tool === 'fill' ||
        tool === 'rect' ||
        tool === 'ellipse' ||
        tool === 'camera';

      if (paintTools && lassoSelectionRef.current) {
        // Switching to paint: apply floating selection first (keeps fill / moves)
        commitFloatingSelection();
        bindActiveSurface();
        present();
      }

      // Lasso fill is paint-only — never transform a floating selection
      const transformTool = tool === 'select' || tool === 'lasso' || tool === 'move' || tool === 'scale';
      if (transformTool && lassoSelectionRef.current) {
        const hit = hitTestSelection(lassoSelectionRef.current, x, y, canvas.width);
        if (hit) {
          beginTransform(x, y, hit);
          return;
        }
        if (tool === 'select' || tool === 'lasso') {
          commitFloatingSelection();
          present();
        } else {
          isDrawingRef.current = false;
          return;
        }
      }
      if (tool === 'lassoFill' && lassoSelectionRef.current) {
        // Drop any leftover select/lasso UI before painting a fill path
        discardFloatingSelection();
        present();
      }

      if (tool === 'eyedropper') {
        isDrawingRef.current = true;
        isEyedroppingRef.current = true;
        sampleColorAt(x, y, e, { persistPreview: true });
        return;
      }

      if (tool === 'fill') {
        isDrawingRef.current = false;
        saveStateToHistory();
        const rgba = hexToRgba(color, opacity / 100);
        const bg = hexToRgba(backgroundColorRef.current, 1);
        const edgeMode = fillEdgeModeRef.current;
        const edgeW = Math.max(1, fillEdgeWidthRef.current);
        const fillOpts = {
          tolerance: 28,
          edgeMode,
          edgeWidth: edgeW,
          bgR: bg.r,
          bgG: bg.g,
          bgB: bg.b,
          bgA: bg.a,
        };
        const sel = lassoSelectionRef.current;
        if (sel && selectionSpriteRef.current) {
          selectionMutatedContentRef.current = true;
          if (edgeMode === 'background') {
            recolorSpriteWithEdge(
              selectionSpriteRef.current,
              rgba.r,
              rgba.g,
              rgba.b,
              rgba.a / 255,
              { r: bg.r, g: bg.g, b: bg.b, a: bg.a, width: edgeW }
            );
          } else {
            recolorSpritePreserveAlpha(
              selectionSpriteRef.current,
              rgba.r,
              rgba.g,
              rgba.b,
              rgba.a / 255
            );
          }
          blitFloatingSelection();
          persistLayersRef.current();
          blitFloatingSelection();
          return;
        }
        const layer = activeRuntimeLayer();
        if (!layer) return;
        const layerCtx = layer.canvas.getContext('2d');
        if (!layerCtx) return;
        const imageData = layerCtx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        let changed = false;
        if (sel && sel.points.length >= 3) {
          const mask = polygonMask(layer.canvas.width, layer.canvas.height, sel.points);
          changed = floodFillMasked(
            imageData,
            mask,
            x,
            y,
            rgba.r,
            rgba.g,
            rgba.b,
            rgba.a,
            fillOpts
          );
        } else {
          changed = floodFillImageData(
            imageData,
            x,
            y,
            rgba.r,
            rgba.g,
            rgba.b,
            rgba.a,
            fillOpts
          );
        }
        if (changed) {
          layerCtx.putImageData(imageData, 0, 0);
          persistLayersRef.current();
        } else if (historyRef.current.length > 0) {
          historyRef.current.pop();
          onHistoryChange?.({
            canUndo: historyRef.current.length > 0,
            canRedo: redoStackRef.current.length > 0,
          });
        }
        return;
      }

      // Select/lasso record history only when the layer is actually mutated (punch / fill)
      if (
        tool === 'brush' ||
        tool === 'eraser' ||
        tool === 'arrow' ||
        tool === 'line' ||
        tool === 'text' ||
        tool === 'rect' ||
        tool === 'ellipse' ||
        tool === 'camera'
      ) {
        saveStateToHistory();
      }

      // ??????????????????
      if (tool === 'brush' || tool === 'eraser') {
        stabilizerFollowRef.current = { x, y };
        lastSimPressureRef.current = effectivePressure;
        lastSampleTimeRef.current = performance.now();
        pathPointsRef.current = [{ x, y, pressure: effectivePressure }];
        strokeFullPointsRef.current = [{ x, y, pressure: effectivePressure }];
        strokeCursorRef.current = createStrokeCursor();
        // GPU backup via drawImage (avoid getImageData GPU?CPU stall)
        if (canvas && ctx) {
          const backup = ensureScratch(brushBackupCanvasRef, canvas.width, canvas.height);
          const bctx = backup.getContext('2d');
          if (bctx) {
            bctx.setTransform(1, 0, 0, 1, 0, 0);
            bctx.clearRect(0, 0, backup.width, backup.height);
            bctx.drawImage(canvas, 0, 0);
          }
          brushBaseImageDataRef.current = null;
        }
        if (tool === 'brush' && !lassoSelectionRef.current) {
          rebuildStrokeUnderlay();
          strokeLivePresentRef.current = true;
        } else {
          strokeLivePresentRef.current = false;
        }
        const spr = selectionSpriteRef.current;
        if (spr) {
          const sctx = spr.getContext('2d');
          spriteBrushBaseRef.current = sctx
            ? sctx.getImageData(0, 0, spr.width, spr.height)
            : null;
        } else {
          spriteBrushBaseRef.current = null;
        }
      }

      // Select / lasso cut: floating selection. Lasso fill: immediate paint (no floating UI).
      if (tool === 'lasso' || tool === 'lassoFill' || tool === 'select') {
        isLassoDrawingRef.current = true;
        lassoPointsRef.current = [{ x, y }];
        if (lassoSelectionRef.current) {
          discardFloatingSelection();
          presentLayersRef.current();
        }
        clearSelectionOverlay();
        if (tool === 'lassoFill') {
          // No layer freeze — fill commits straight to the bitmap on pointer-up
          selectionLayerBackupRef.current = null;
          selectionPristineBackupRef.current = null;
          brushBaseImageDataRef.current = null;
        } else if (canvas) {
          // Freeze layer for cancel restore — preview only on overlay
          selectionLayerBackupRef.current = cloneCanvas(canvas);
          selectionPristineBackupRef.current = null;
          brushBaseImageDataRef.current = null;
        }
        return;
      }

      if (tool === 'move') {
        const layer = layersRuntimeRef.current.find((item) => item.id === activeLayerIdRef.current);
        if (layer && layer.role !== 'background' && canvas && ctx) {
          const sprite = document.createElement('canvas');
          sprite.width = canvas.width;
          sprite.height = canvas.height;
          sprite.getContext('2d')?.drawImage(canvas, 0, 0);
          layerDragRef.current = { x, y, sprite };
          isDrawingRef.current = true;
        }
        return;
      }

      if (tool === 'scale' && !lassoSelectionRef.current) {
        const layer = layersRuntimeRef.current.find((item) => item.id === activeLayerIdRef.current);
        if (layer && layer.role !== 'background' && canvas && ctx) {
          const sprite = document.createElement('canvas');
          sprite.width = canvas.width;
          sprite.height = canvas.height;
          sprite.getContext('2d')?.drawImage(canvas, 0, 0);
          layerDragRef.current = { x: canvas.width / 2, y: canvas.height / 2, sprite };
          scaleDragRef.current = {
            cx: canvas.width / 2,
            cy: canvas.height / 2,
            dist: Math.max(24, Math.hypot(x - canvas.width / 2, y - canvas.height / 2)),
            bounds: { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height, width: canvas.width, height: canvas.height },
          };
          isDrawingRef.current = true;
        }
        return;
      }

      // ???? / ???????????? ImageData????????
      if (
        (tool === 'arrow' || tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'camera') &&
        canvas
      ) {
        arrowBaseImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        stabilizerFollowRef.current = null;
      }

      // ??????
      if (tool === 'text') {
        // ??????????????????????
        if (textInput && textInputContainerRef.current) {
          const rect = textInputContainerRef.current.getBoundingClientRect();
          let clientX = 0;
          let clientY = 0;
          if (e instanceof MouseEvent) {
            clientX = e.clientX;
            clientY = e.clientY;
          } else if (e instanceof TouchEvent && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
          } else if ('clientX' in e && 'clientY' in e) {
            clientX = typeof e.clientX === 'number' ? e.clientX : 0;
            clientY = typeof e.clientY === 'number' ? e.clientY : 0;
          }
          
          // restored
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            return;
          }
        }

        const { x, y } = getScaledCoordinates(e);
        let clickedTextObj: typeof textObjectsRef.current[0] | undefined;
        
        if (canvas && ctx) {
          // restored
          ctx.save();
          clickedTextObj = textObjectsRef.current.find((textObj) => {
            const lines = textObj.text.split('\n');
            const lineHeight = textObj.fontSize * 1.2;
            const textHeight = lines.length * lineHeight;
            
            // ??????
            ctx.font = `${textObj.fontSize}px sans-serif`;
            const metrics = ctx.measureText(textObj.text.split('\n')[0] || '');
            const textWidth = metrics.width;
            
            const padding = 10; // ????
            return (
              x >= textObj.x - padding &&
              x <= textObj.x + textWidth + padding &&
              y >= textObj.y - padding &&
              y <= textObj.y + textHeight + padding
            );
          });
          ctx.restore();
        }

        if (clickedTextObj) {
          // comment
          isDrawingRef.current = false;
          selectedTextIdRef.current = clickedTextObj.id;
          // comment
          textObjectsRef.current.forEach((obj) => {
            obj.isSelected = obj.id === clickedTextObj.id;
            obj.isDragging = obj.id === clickedTextObj.id;
            obj.dragOffset = obj.id === clickedTextObj.id ? {
              x: x - obj.x,
              y: y - obj.y,
            } : undefined;
          });
          // ????
          drawAllTextObjects();
          return;
        }
        
        // comment
        isDrawingRef.current = false;
        // comment
        textObjectsRef.current.forEach((obj) => {
          obj.isSelected = false;
          obj.isDragging = false;
        });
        selectedTextIdRef.current = null;
        setTextInput({
          x,
          y,
          text: '',
          fontSize: brushSize * 5, // ??????
          visible: true,
          isDragging: false,
          dragOffset: null,
        });
        // comment
        setTimeout(() => {
          textInputRef.current?.focus();
        }, 100);
        return;
      }

      if (tool === 'brush' || tool === 'eraser') {
        pathPointsRef.current = [{ x, y, pressure: effectivePressure }];
        strokeFullPointsRef.current = [{ x, y, pressure: effectivePressure }];
        lastPosRef.current = { x, y, time: Date.now() };
        strokeCursorRef.current = createStrokeCursor();
        paintBrushDab(x, y, effectivePressure, tool === 'eraser');
      }
    };

    const draw = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!layersReadyRef.current) return;
      bindActiveSurface();
      if (!canvas || !ctx) return;

      if (longPressOriginRef.current && longPressTimerRef.current != null) {
        // Cancel eyedropper arm once the finger clearly moves (client px — touch jitter tolerant).
        let clientX = 0;
        let clientY = 0;
        if (e instanceof PointerEvent || e instanceof MouseEvent) {
          clientX = e.clientX;
          clientY = e.clientY;
        } else if ('touches' in e && e.touches[0]) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        }
        const origin = longPressOriginRef.current;
        if (Math.hypot(clientX - origin.clientX, clientY - origin.clientY) > LONG_PRESS_SLOP_PX) {
          clearLongPress();
        }
      }

      // Live eyedropper (tool or long-press hold): preview swatch tracks the tip
      if (isEyedroppingRef.current || (tool === 'eyedropper' && isDrawingRef.current)) {
        e.preventDefault();
        const { x, y } = getScaledCoordinates(e);
        sampleColorAt(x, y, e, { persistPreview: true });
        return;
      }
      if (longPressFiredRef.current) return;

      // restored
      if (tool === 'text' && textInput && textInput.isDragging && textInput.dragOffset) {
        e.preventDefault();
        const { x, y } = getScaledCoordinates(e);
        setTextInput({
          ...textInput,
          x: x - textInput.dragOffset.x,
          y: y - textInput.dragOffset.y,
        });
        return;
      }

      // ????????????
      if (tool === 'text' && selectedTextIdRef.current) {
        const selectedTextObj = textObjectsRef.current.find((obj) => obj.id === selectedTextIdRef.current && obj.isDragging);
        if (selectedTextObj && selectedTextObj.dragOffset) {
          e.preventDefault();
          const { x, y } = getScaledCoordinates(e);
          selectedTextObj.x = x - selectedTextObj.dragOffset.x;
          selectedTextObj.y = y - selectedTextObj.dragOffset.y;
          // ???????????????????????
          // restored
          if (canvas && ctx) {
            const baseImageToUse = baseImageRef.current || (shot.image || null);
            
            if (baseImageToUse) {
              const img = new Image();
              img.onload = () => {
                drawBitmap1x1(ctx, canvas, img);
                // comment
                drawTextObjectsOnly(ctx, canvas, true);
              };
              img.src = baseImageToUse;
            } else {
              // ????????????
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              drawTextObjectsOnly(ctx, canvas);
            }
          }
          return;
        }
      }

      // Lasso / box / lasso-fill preview — overlay only; never touch layer pixels while dragging
      if (
        (tool === 'lasso' || tool === 'lassoFill' || tool === 'select') &&
        isLassoDrawingRef.current
      ) {
        e.preventDefault();
        const { x, y } = getScaledCoordinates(e);
        if (tool === 'select' && startPosRef.current) {
          const x0 = startPosRef.current.x;
          const y0 = startPosRef.current.y;
          lassoPointsRef.current = [
            { x: x0, y: y0 },
            { x, y: y0 },
            { x, y },
            { x: x0, y },
          ];
        } else {
          lassoPointsRef.current.push({ x, y });
        }
        syncSelectionOverlaySize();
        clearSelectionOverlay();
        const points = lassoPointsRef.current;
        const overlay = selectionOverlayRef.current;
        const octx = overlay?.getContext('2d');
        if (octx && points.length > 1) {
          octx.save();
          octx.imageSmoothingEnabled = false;
          octx.beginPath();
          octx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) octx.lineTo(points[i].x, points[i].y);
          if (tool === 'select' || tool === 'lassoFill') octx.closePath();
          if (tool === 'lassoFill' && points.length > 2) {
            // Live fill preview (no ants) — matches commit look
            octx.globalAlpha = Math.min(0.45, Math.max(0.15, opacity / 100));
            octx.fillStyle = color;
            octx.fill();
            octx.globalAlpha = 1;
            octx.strokeStyle = color;
            octx.lineWidth = 1;
            octx.setLineDash([]);
            octx.stroke();
          } else {
            octx.strokeStyle = '#0066ff';
            octx.lineWidth = 1;
            octx.setLineDash([6, 4]);
            octx.stroke();
          }
          octx.restore();
        }
        return;
      }

      if (transformDragRef.current && lassoSelectionRef.current && selectionSpriteRef.current) {
        e.preventDefault();
        const { x, y } = getScaledCoordinates(e);
        const drag = transformDragRef.current;
        const sel = lassoSelectionRef.current;
        const start = drag.startBounds;
        const center = selectionCenter(start);
        if (drag.mode === 'move') {
          const minX = start.minX + (x - drag.startX);
          const minY = start.minY + (y - drag.startY);
          sel.bounds = {
            minX,
            minY,
            maxX: minX + start.width,
            maxY: minY + start.height,
            width: start.width,
            height: start.height,
          };
          sel.rotation = drag.startRotation;
        } else if (drag.mode === 'rotate') {
          const angle = Math.atan2(y - center.y, x - center.x);
          sel.rotation = drag.startRotation + angle - drag.startAngle;
          sel.bounds = { ...start };
        } else {
          const local = toLocalPoint(start, drag.startRotation, x, y);
          let width = start.width;
          let height = start.height;
          if (drag.mode === 'e' || drag.mode === 'w') {
            width = Math.max(8, Math.abs(local.x) * 2);
          } else if (drag.mode === 'n' || drag.mode === 's') {
            height = Math.max(8, Math.abs(local.y) * 2);
          } else {
            const factor = Math.max(0.05, Math.min(12, Math.hypot(x - center.x, y - center.y) / drag.startDist));
            width = Math.max(8, start.width * factor);
            height = Math.max(8, start.height * factor);
          }
          sel.bounds = {
            minX: center.x - width / 2,
            minY: center.y - height / 2,
            maxX: center.x + width / 2,
            maxY: center.y + height / 2,
            width,
            height,
          };
          sel.rotation = drag.startRotation;
        }
        blitFloatingSelection();
        return;
      }

      if (tool === 'scale' && isDrawingRef.current && scaleDragRef.current && layerDragRef.current) {
        e.preventDefault();
        const { x, y } = getScaledCoordinates(e);
        const startDrag = scaleDragRef.current;
        const factor = Math.max(0.15, Math.min(8, Math.hypot(x - startDrag.cx, y - startDrag.cy) / startDrag.dist));
        const sprite = layerDragRef.current.sprite;
        const width = Math.max(2, startDrag.bounds.width * factor);
        const height = Math.max(2, startDrag.bounds.height * factor);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sprite, startDrag.cx - width / 2, startDrag.cy - height / 2, width, height);
        present();
        return;
      }

      if (tool === 'move' && isDrawingRef.current && layerDragRef.current && !lassoSelectionRef.current) {
        e.preventDefault();
        const { x, y } = getScaledCoordinates(e);
        const drag = layerDragRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(drag.sprite, x - drag.x, y - drag.y);
        present();
        return;
      }


      if (!isDrawingRef.current) return;
      if (isPinchingRef.current || activePointersRef.current.size > 1) return;
      if (
        e instanceof PointerEvent &&
        drawingPointerIdRef.current !== null &&
        e.pointerId !== drawingPointerIdRef.current
      ) {
        return;
      }

      e.preventDefault();
      const { x, y } = getScaledCoordinates(e);
      const resolved = resolveStrokePressure(e, strokeUsesDevicePressureRef.current);
      const wantsPressure = enablePressure || enableOpacityPressure;
      if (wantsPressure && resolved.hasDevicePressure) strokeUsesDevicePressureRef.current = true;
      let effectivePressure = 0.5;
      if (wantsPressure) {
        if (resolved.hasDevicePressure) {
          effectivePressure = resolved.pressure;
        } else {
          // Mouse / finger: simulate pressure from speed so opacity pressure still reads
          const now = performance.now();
          const prev = lastPosRef.current;
          if (prev) {
            const dist = Math.hypot(x - prev.x, y - prev.y);
            const dt = Math.max(1, now - (lastSampleTimeRef.current || now));
            effectivePressure = velocityToPressure(dist, dt, lastSimPressureRef.current);
            if (speedTaper) {
              effectivePressure = Math.pow(effectivePressure, 0.9);
            }
          } else {
            effectivePressure = 0.65;
          }
          lastSimPressureRef.current = effectivePressure;
          lastSampleTimeRef.current = now;
        }
      }
      currentPressureRef.current = effectivePressure;
      {
        const penAng = resolvePenAngleDeg(e);
        if (penAng != null) penAngleDegRef.current = penAng;
      }

      if (tool === 'brush' || tool === 'eraser') {
        const stabilized = stabilizePoint(x, y);
        const sx = stabilized.x;
        const sy = stabilized.y;
        const effectiveSize = getEffectiveBrushSize(effectivePressure);
        const erase = tool === 'eraser';

        const last = pathPointsRef.current[pathPointsRef.current.length - 1];
        if (!last || Math.hypot(sx - last.x, sy - last.y) >= 0.35) {
          pathPointsRef.current.push({ x: sx, y: sy, pressure: effectivePressure });
          if (pathPointsRef.current.length > 8) {
            pathPointsRef.current.splice(0, pathPointsRef.current.length - 8);
          }
          strokeFullPointsRef.current.push({ x: sx, y: sy, pressure: effectivePressure });
        }
        lastPosRef.current = { x: sx, y: sy, time: Date.now() };
        paintBrushDab(sx, sy, effectivePressure, erase);

        if (erase) {
          const pad = effectiveSize / 2;
          const eraserMinX = sx - pad;
          const eraserMaxX = sx + pad;
          const eraserMinY = sy - pad;
          const eraserMaxY = sy + pad;
          const originalLength = textObjectsRef.current.length;
          textObjectsRef.current = textObjectsRef.current.filter((textObj) => {
            ctx.save();
            ctx.font = `${textObj.fontSize}px sans-serif`;
            const metrics = ctx.measureText(textObj.text.split('\n')[0] || '');
            const textWidth = metrics.width;
            ctx.restore();
            const lines = textObj.text.split('\n');
            const textHeight = lines.length * textObj.fontSize * 1.2;
            const overlaps = !(
              textObj.x + textWidth < eraserMinX ||
              textObj.x > eraserMaxX ||
              textObj.y + textHeight < eraserMinY ||
              textObj.y > eraserMaxY
            );
            return !overlaps;
          });
          if (textObjectsRef.current.length < originalLength) {
            renderAllTextObjects();
          }
        }
      } else if (
        (tool === 'arrow' ||
          tool === 'line' ||
          tool === 'rect' ||
          tool === 'ellipse' ||
          tool === 'camera') &&
        startPosRef.current
      ) {
        if (arrowBaseImageDataRef.current) {
          ctx.putImageData(arrowBaseImageDataRef.current, 0, 0);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = opacity / 100;
        const x0 = startPosRef.current.x;
        const y0 = startPosRef.current.y;
        withPaintClip(() => {
          if (tool === 'arrow') {
            drawArrow(ctx, x0, y0, x, y, applyStyle(), brushSize, arrowStyleRef.current);
          } else if (tool === 'line') {
            drawStraightLine(ctx, x0, y0, x, y, applyStyle(), brushSize);
          } else if (tool === 'rect') {
            drawRectMark(ctx, x0, y0, x, y, applyStyle(), brushSize);
          } else if (tool === 'ellipse') {
            drawEllipseMark(ctx, x0, y0, x, y, applyStyle(), brushSize);
          } else {
            drawCameraMark(ctx, x0, y0, x, y, applyStyle(), brushSize);
          }
        });
        ctx.globalAlpha = 1;
        present();
      }
    };

    const stopDrawing = () => {
      clearLongPress();
      if (isEyedroppingRef.current || tool === 'eyedropper' || longPressFiredRef.current) {
        isEyedroppingRef.current = false;
        longPressFiredRef.current = false;
        isDrawingRef.current = false;
        if (eyedropperPreviewTimerRef.current != null) {
          window.clearTimeout(eyedropperPreviewTimerRef.current);
        }
        eyedropperPreviewTimerRef.current = window.setTimeout(() => {
          setEyedropperPreview(null);
          eyedropperPreviewTimerRef.current = null;
        }, 500);
        drawingPointerIdRef.current = null;
        startPosRef.current = null;
        pathPointsRef.current = [];
        arrowBaseImageDataRef.current = null;
        brushBaseImageDataRef.current = null;
        spriteBrushBaseRef.current = null;
        return;
      }
      if (
        (tool === 'lasso' || tool === 'lassoFill' || tool === 'select') &&
        isLassoDrawingRef.current &&
        lassoPointsRef.current.length <= 2
      ) {
        isLassoDrawingRef.current = false;
        isDrawingRef.current = false;
        drawingPointerIdRef.current = null;
        startPosRef.current = null;
        lassoPointsRef.current = [];
        brushBaseImageDataRef.current = null;
        if (!lassoSelectionRef.current) {
          selectionLayerBackupRef.current = null;
          selectionPristineBackupRef.current = null;
        }
        clearSelectionOverlay();
        present();
        return;
      }
      // Lasso fill (MoArt-style): path complete → fill polygon on layer → done. No ants / move.
      if (tool === 'lassoFill' && isLassoDrawingRef.current && lassoPointsRef.current.length > 2) {
        isLassoDrawingRef.current = false;
        isDrawingRef.current = false;
        drawingPointerIdRef.current = null;
        startPosRef.current = null;
        const points = [...lassoPointsRef.current];
        lassoPointsRef.current = [];
        clearSelectionOverlay();
        if (canvas && ctx && points.length >= 3) {
          saveStateToHistory();
          const edge =
            fillEdgeModeRef.current === 'background'
              ? {
                  color: backgroundColorRef.current,
                  width: Math.max(1, fillEdgeWidthRef.current),
                }
              : undefined;
          withPaintClip(() => {
            fillPolygon(ctx, points, color, opacity / 100, edge);
          });
          present();
          persistLayersRef.current();
        } else {
          present();
        }
        selectionLayerBackupRef.current = null;
        selectionPristineBackupRef.current = null;
        brushBaseImageDataRef.current = null;
        return;
      }

      // Select / lasso cut: create floating selection (ants + transform). Layer untouched until punch.
      if (
        (tool === 'lasso' || tool === 'select') &&
        isLassoDrawingRef.current &&
        lassoPointsRef.current.length > 2
      ) {
        isLassoDrawingRef.current = false;
        isDrawingRef.current = false;
        drawingPointerIdRef.current = null;
        startPosRef.current = null;
        if (canvas && ctx) {
          const points = [...lassoPointsRef.current];

          const minX = Math.floor(Math.min(...points.map((p) => p.x)));
          const maxX = Math.ceil(Math.max(...points.map((p) => p.x)));
          const minY = Math.floor(Math.min(...points.map((p) => p.y)));
          const maxY = Math.ceil(Math.max(...points.map((p) => p.y)));
          const width = Math.max(1, maxX - minX);
          const height = Math.max(1, maxY - minY);

          if (!selectionLayerBackupRef.current) {
            selectionLayerBackupRef.current = cloneCanvas(canvas);
          }
          selectionHoleRef.current = null;

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.imageSmoothingEnabled = false;
            const localPts = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
            tempCtx.beginPath();
            tempCtx.moveTo(localPts[0].x, localPts[0].y);
            for (let i = 1; i < localPts.length; i++) {
              tempCtx.lineTo(localPts[i].x, localPts[i].y);
            }
            tempCtx.closePath();
            tempCtx.clip();
            tempCtx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);
            selectionSpriteRef.current = tempCanvas;
          }

          selectionMutatedContentRef.current = false;
          lassoSelectionRef.current = {
            points,
            localPoints: points.map((point) => ({
              x: (point.x - minX) / width,
              y: (point.y - minY) / height,
            })),
            imageData: '',
            bounds: { minX, minY, maxX, maxY, width, height },
            rotation: 0,
          };
          selectionOriginRef.current = { minX, minY, width, height, rotation: 0 };

          blitFloatingSelection();
          lassoPointsRef.current = [];
          brushBaseImageDataRef.current = null;
        }
        return;
      }

      if (transformDragRef.current && isDrawingRef.current) {
        isDrawingRef.current = false;
        transformDragRef.current = null;
        persistLayersRef.current();
        blitFloatingSelection();
        return;
      }

      if (tool === 'scale' && isDrawingRef.current) {
        isDrawingRef.current = false;
        scaleDragRef.current = null;
        layerDragRef.current = null;
        persistLayersRef.current();
        blitFloatingSelection();
        return;
      }

      if (tool === 'move' && isDrawingRef.current) {
        isDrawingRef.current = false;
        moveOffsetRef.current = null;
        moveStartPosRef.current = null;
        layerDragRef.current = null;
        persistLayersRef.current();
        blitFloatingSelection();
        return;
      }

      // restored
      if (tool === 'text' && textInput && textInput.isDragging) {
        setTextInput(prev => prev ? { ...prev, isDragging: false, dragOffset: null } : null);
        return;
      }

      // ????????????
      if (tool === 'text' && selectedTextIdRef.current) {
        const selectedTextObj = textObjectsRef.current.find((obj) => obj.id === selectedTextIdRef.current);
        if (selectedTextObj && selectedTextObj.isDragging) {
          selectedTextObj.isDragging = false;
          selectedTextObj.dragOffset = undefined;
          // restored
          saveStateToHistory();
          persistLayersRef.current();
        }
        return;
      }

      if (isDrawingRef.current) {
        // Finalize brush stroke with taperOut: restore backup and restamp full path
        if (
          tool === 'brush' &&
          taperOut > 0.5 &&
          strokeFullPointsRef.current.length >= 2 &&
          brushBackupCanvasRef.current &&
          canvas &&
          ctx
        ) {
          const pts = strokeFullPointsRef.current.slice();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(brushBackupCanvasRef.current, 0, 0);
          const opts = {
            ...buildStrokeOpts(brushAlpha()),
            taperIn,
            taperOut,
          };
          withPaintClip(() => {
            stampPressureStroke(ctx, pts, opts);
          });
        }

        isDrawingRef.current = false;
        strokeLivePresentRef.current = false;
        // Flush any coalesced present from the last dab
        if (presentRafRef.current != null) {
          cancelAnimationFrame(presentRafRef.current);
          presentRafRef.current = null;
        }
        if (lassoSelectionRef.current) blitFloatingSelection();
        else present();
        persistLayersRef.current();
        startPosRef.current = null;
        lastPosRef.current = null;
        pathPointsRef.current = [];
        strokeFullPointsRef.current = [];
        currentPressureRef.current = 1;
        arrowBaseImageDataRef.current = null;
        brushBaseImageDataRef.current = null;
        brushBackupCanvasRef.current = null;
        spriteBrushBaseRef.current = null;
        strokeCursorRef.current = createStrokeCursor();
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      }
    };


    const startDrawingHandler = (e: Event) => {
      if (isSpacePressedRef.current || isPanningRef.current || isPinchingRef.current) return;
      if (e instanceof PointerEvent && !e.isPrimary) return;
      // Ignore legacy mouse events when Pointer Events already drive the stroke
      if (!(e instanceof PointerEvent) && drawingPointerIdRef.current !== null) return;
      if (!(e instanceof PointerEvent) && isDrawingRef.current) return;
      startDrawing(e as MouseEvent | TouchEvent | PointerEvent);
    };
    const drawHandler = (e: Event) => {
      if (isSpacePressedRef.current || isPanningRef.current || isPinchingRef.current) return;
      if (!(e instanceof PointerEvent) && drawingPointerIdRef.current !== null) return;
      if (e instanceof PointerEvent && typeof e.getCoalescedEvents === 'function') {
        const coalesced = e.getCoalescedEvents();
        if (coalesced.length > 1) {
          for (const ce of coalesced) draw(ce);
          return;
        }
      }
      draw(e as MouseEvent | TouchEvent | PointerEvent);
    };
    const stopDrawingHandler = (e: Event) => {
      if (isPinchingRef.current) return;
      if (e instanceof PointerEvent) {
        // Don't end the stroke on pointerout ? capture keeps moves flowing; out was cutting strokes.
        if (e.type === 'pointerout' || e.type === 'pointerleave') return;
        if (drawingPointerIdRef.current !== null && e.pointerId !== drawingPointerIdRef.current) return;
      } else if (drawingPointerIdRef.current !== null) {
        return;
      }
      stopDrawing();
      drawingPointerIdRef.current = null;
    };

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    displayCanvas.addEventListener('pointerdown', startDrawingHandler);
    displayCanvas.addEventListener('pointermove', drawHandler);
    displayCanvas.addEventListener('pointerup', stopDrawingHandler);
    displayCanvas.addEventListener('pointercancel', stopDrawingHandler);
    displayCanvas.addEventListener('lostpointercapture', stopDrawingHandler);
    displayCanvas.addEventListener('contextmenu', preventContextMenu);
    // Mouse fallback only for environments without Pointer Events
    if (!('onpointerdown' in window)) {
      displayCanvas.addEventListener('mousedown', startDrawingHandler);
      displayCanvas.addEventListener('mousemove', drawHandler);
      displayCanvas.addEventListener('mouseup', stopDrawingHandler);
      displayCanvas.addEventListener('mouseout', stopDrawingHandler);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      displayCanvas.removeEventListener('pointerdown', startDrawingHandler);
      displayCanvas.removeEventListener('pointermove', drawHandler);
      displayCanvas.removeEventListener('pointerup', stopDrawingHandler);
      displayCanvas.removeEventListener('pointercancel', stopDrawingHandler);
      displayCanvas.removeEventListener('lostpointercapture', stopDrawingHandler);
      displayCanvas.removeEventListener('contextmenu', preventContextMenu);
      displayCanvas.removeEventListener('mousedown', startDrawingHandler);
      displayCanvas.removeEventListener('mousemove', drawHandler);
      displayCanvas.removeEventListener('mouseup', stopDrawingHandler);
      displayCanvas.removeEventListener('mouseout', stopDrawingHandler);
    };
  }, [
    shotId,
    tool,
    color,
    brushSize,
    opacity,
    enablePressure,
    enableOpacityPressure,
    opacityPressureStrength,
    smoothness,
    brushTexture,
    stabilizer,
    sizePressure,
    taperIn,
    taperOut,
    minSizeRatio,
    density,
    tipSpacing,
    scatter,
    hardness,
    tipAngle,
    speedTaper,
    watercolorEdge,
    edgeThickness,
    edgeStrength,
    edgeDarkness,
    edgeBlur,
    flow,
    thickness,
    sizeJitter,
    angleJitter,
    densityJitter,
    tipSpacingAuto,
    tipImage,
    dualTipImage,
    texturePatternImage,
    psBrush,
    directionMode,
    binarize,
    blendMode,
    ribbon,
    ribbonCycle,
    alternateSides,
    verticalThickness,
    tipFoilComposite,
    highSpeedTexture,
    textureStrengthProp,
    shapeVariation,
    backgroundColor,
    fillEdgeMode,
    fillEdgeWidth,
    pressureSizeCurve,
    updateShot,
    onHistoryChange,
  ]);

  const saveTextAsObject = (text: string, x: number, y: number, fontSize: number) => {
    if (!text.trim()) return;
    
    const textObj = {
      id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x,
      y,
      text,
      fontSize,
      color,
      opacity,
      isSelected: false,
      isDragging: false,
    };
    
    // comment
    textObjectsRef.current.push(textObj);
    
    // ????????????????
    renderAllTextObjects();
    // ???drawAllTextObjects ?????????? updateShot
  };

  const renderAllTextObjects = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ???? drawAllTextObjects???????????????????
    drawAllTextObjects();
  };

  const drawAllTextObjects = () => {
    const layer = activeRuntimeLayer();
    if (!layer) return;
    const layerCtx = layer.canvas.getContext('2d');
    if (!layerCtx) return;
    const snap = textLayerSnapshotRef.current;
    if (!snap || snap.layerId !== layer.id) {
      textLayerSnapshotRef.current = {
        layerId: layer.id,
        data: layerCtx.getImageData(0, 0, layer.canvas.width, layer.canvas.height),
      };
    } else {
      layerCtx.putImageData(snap.data, 0, 0);
    }
    drawTextObjectsOnly(layerCtx, layer.canvas);
  };

  const renderCanvasWithSelection = () => {
    presentLayers();
    redrawSelectionOverlay();
  };

  const drawTextObjectsOnly = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, skipSave = false) => {
    // comment
    textObjectsRef.current.forEach((textObj) => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = textObj.opacity / 100;
      ctx.fillStyle = textObj.color;
      ctx.font = `${textObj.fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      const lines = textObj.text.split('\n');
      const lineHeight = textObj.fontSize * 1.2;
      
      lines.forEach((line, index) => {
        ctx.fillText(line, textObj.x, textObj.y + index * lineHeight);
      });

      // restored
      if (textObj.isSelected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const metrics = ctx.measureText(textObj.text.split('\n')[0] || '');
        const textHeight = lines.length * lineHeight;
        const padding = 4;
        ctx.strokeRect(
          textObj.x - padding,
          textObj.y - padding,
          Math.max(metrics.width, 50) + padding * 2,
          textHeight + padding * 2
        );
        ctx.setLineDash([]);
      }

          ctx.restore();
    });
          
    ctx.globalAlpha = 1;
          
    // Drop history snapshot written at stroke start (avoid empty undo from multi-touch)
    if (!skipSave) {
      persistLayersRef.current();
    }
  };

  const handleTextConfirm = (text: string) => {
    if (textInput) {
      saveTextAsObject(text, textInput.x, textInput.y, textInput.fontSize);
      setTextInput(null);
    }
  };

  const handleTextCancel = () => {
    setTextInput(null);
  };

  // ??????????????????
  useEffect(() => {
    if (tool !== 'text' && textInput) {
      setTextInput(null);
    }
  }, [tool, textInput]);

  useEffect(() => {
    let frame = 0;
    let hadSelection = false;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!canvasRef.current || isLassoDrawingRef.current || isDrawingRef.current) return;
      const sel = lassoSelectionRef.current;
      if (!sel) {
        if (hadSelection) {
          clearSelectionOverlay();
          hadSelection = false;
        }
        return;
      }
      hadSelection = true;
      selectionDashRef.current = (selectionDashRef.current + 0.35) % 28;
      redrawSelectionOverlay();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shotId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || textInput || !lassoSelectionRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      event.preventDefault();
      discardFloatingSelection();
      presentLayers();
      clearSelectionOverlay();
      persistLayers();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [textInput, shotId]);

  // comment
  useEffect(() => {
    if (lassoSelectionRef.current && canvasRef.current) {
      renderCanvasWithSelection();
    }
  }, [tool]);

  // comment
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    const handleWheel = (e: WheelEvent) => {
      // restored
      if (e.ctrlKey || e.metaKey || e.deltaY === 0) {
        e.preventDefault();
        
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(5, canvasTransform.scale * scaleFactor));
        
        const scaleChange = newScale / canvasTransform.scale;
        const newTranslateX = mouseX - (mouseX - canvasTransform.translateX) * scaleChange;
        const newTranslateY = mouseY - (mouseY - canvasTransform.translateY) * scaleChange;
        
        setCanvasTransform({
          scale: newScale,
          translateX: newTranslateX,
          translateY: newTranslateY,
          rotation: canvasTransformRef.current.rotation,
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // ????????????????container????????
      if (!container || !containerRef.current) {
        return;
      }
      
      if (e.code === 'Space' && !isSpacePressedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        isSpacePressedRef.current = true;
        if (container) {
          container.style.cursor = 'grab';
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      // ???????????
      if (!container || !containerRef.current) {
        return;
      }
      
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation(); // ??????
        e.stopImmediatePropagation(); // ??????
        isSpacePressedRef.current = false;
        isPanningRef.current = false;
        panStartRef.current = null;
        if (container) {
          container.style.cursor = '';
        }
      }
    };

    const handlePanStart = (e: MouseEvent | PointerEvent) => {
      if (!isSpacePressedRef.current) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ????????????????
      isPanningRef.current = true;
      const rect = container.getBoundingClientRect();
      panStartRef.current = {
        x: e.clientX - rect.left - canvasTransform.translateX,
        y: e.clientY - rect.top - canvasTransform.translateY,
      };
      if (container) {
        container.style.cursor = 'grabbing';
      }
    };

    const handlePanMove = (e: MouseEvent | PointerEvent) => {
      if (!isPanningRef.current || !panStartRef.current) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // ????????????????
      const rect = container.getBoundingClientRect();
      const newTranslateX = e.clientX - rect.left - panStartRef.current.x;
      const newTranslateY = e.clientY - rect.top - panStartRef.current.y;
      
      setCanvasTransform(prev => ({
        ...prev,
        translateX: newTranslateX,
        translateY: newTranslateY,
      }));
    };

    const handlePanEnd = (e?: MouseEvent | PointerEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // ??????
      }
      isPanningRef.current = false;
      panStartRef.current = null;
      if (container && !isSpacePressedRef.current) {
        container.style.cursor = '';
      }
    };

    const gesturePair = () => {
      const pts = Array.from(activePointersRef.current.values());
      if (pts.length < 2) return null;
      const [a, b] = pts;
      const rect = container.getBoundingClientRect();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return {
        cx: (a.x + b.x) / 2 - rect.left,
        cy: (a.y + b.y) / 2 - rect.top,
        dist: Math.max(1, Math.hypot(dx, dy)),
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    };

    const beginPinch = () => {
      const g = gesturePair();
      if (!g) return;
      cancelActiveStrokeRef.current?.();
      isPinchingRef.current = true;
      isPanningRef.current = false;
      const t = canvasTransformRef.current;
      const rad = (-t.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = g.cx - t.translateX;
      const ly = g.cy - t.translateY;
      pinchGestureRef.current = {
        startDistance: g.dist,
        startAngle: g.angle,
        startScale: t.scale,
        startRotation: t.rotation,
        contentAnchor: {
          x: (lx * cos - ly * sin) / t.scale,
          y: (lx * sin + ly * cos) / t.scale,
        },
      };
    };

    const updatePinch = () => {
      const g = gesturePair();
      const start = pinchGestureRef.current;
      if (!g || !start) return;
      const scale = Math.max(0.1, Math.min(5, start.startScale * (g.dist / start.startDistance)));
      let delta = g.angle - start.startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const rotation = start.startRotation + delta;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const sx = start.contentAnchor.x * scale;
      const sy = start.contentAnchor.y * scale;
      setCanvasTransform({
        scale,
        rotation,
        translateX: g.cx - (sx * cos - sy * sin),
        translateY: g.cy - (sx * sin + sy * cos),
      });
    };

    const clearLongPressFromGesture = () => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressOriginRef.current = null;
    };

    const onGestureDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size === 2) {
        e.preventDefault();
        e.stopPropagation();
        // Abort any in-progress single-finger stroke / long-press so tap can undo cleanly
        clearLongPressFromGesture();
        longPressFiredRef.current = false;
        isEyedroppingRef.current = false;
        cancelActiveStrokeRef.current?.();
        const entries = Array.from(activePointersRef.current.entries());
        twoFingerTapRef.current = {
          active: true,
          startTime: Date.now(),
          startPositions: new Map(entries.map(([id, p]) => [id, { ...p }])),
          moved: false,
        };
        // Don't begin pinch yet — wait to see if it's a tap or pinch
      } else if (activePointersRef.current.size > 2) {
        twoFingerTapRef.current = null;
        beginPinch();
      }
    };

    const onGestureMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size >= 2) {
        e.preventDefault();
        e.stopPropagation();
        const tap = twoFingerTapRef.current;
        if (tap?.active && !tap.moved) {
          const start = tap.startPositions.get(e.pointerId);
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TWO_FINGER_TAP_SLOP_PX) {
            tap.moved = true;
            beginPinch();
          }
        } else if (!tap?.active || tap.moved) {
          if (!pinchGestureRef.current) beginPinch();
          updatePinch();
        }
      }
    };

    const onGestureEnd = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      activePointersRef.current.delete(e.pointerId);
      if (activePointersRef.current.size < 2) {
        pinchGestureRef.current = null;
      }
      const tap = twoFingerTapRef.current;
      // Evaluate two-finger tap only after both fingers are up (don't clear tap on 2→1)
      if (tap?.active && activePointersRef.current.size === 0) {
        const elapsed = Date.now() - tap.startTime;
        if (!tap.moved && elapsed < TWO_FINGER_TAP_MS) {
          undoFromGestureRef.current?.();
        }
        twoFingerTapRef.current = null;
      } else if (activePointersRef.current.size === 0) {
        twoFingerTapRef.current = null;
      }
      if (activePointersRef.current.size === 0) isPinchingRef.current = false;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    container.addEventListener('mousedown', handlePanStart, true);
    canvas.addEventListener('mousedown', handlePanStart, true);
    window.addEventListener('mousemove', handlePanMove);
    window.addEventListener('mouseup', handlePanEnd);
    container.addEventListener('pointerdown', handlePanStart, true);
    canvas.addEventListener('pointerdown', handlePanStart, true);
    window.addEventListener('pointermove', handlePanMove);
    window.addEventListener('pointerup', handlePanEnd);
    container.addEventListener('pointerdown', onGestureDown, true);
    container.addEventListener('pointermove', onGestureMove, true);
    container.addEventListener('pointerup', onGestureEnd, true);
    container.addEventListener('pointercancel', onGestureEnd, true);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('mousedown', handlePanStart, true);
      canvas.removeEventListener('mousedown', handlePanStart, true);
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
      container.removeEventListener('pointerdown', handlePanStart, true);
      canvas.removeEventListener('pointerdown', handlePanStart, true);
      window.removeEventListener('pointermove', handlePanMove);
      window.removeEventListener('pointerup', handlePanEnd);
      container.removeEventListener('pointerdown', onGestureDown, true);
      container.removeEventListener('pointermove', onGestureMove, true);
      container.removeEventListener('pointerup', onGestureEnd, true);
      container.removeEventListener('pointercancel', onGestureEnd, true);
    };
  }, [canvasTransform]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ touchAction: 'none' }}
    >
      {eyedropperPreview && (
        <div
          className="pointer-events-none fixed z-[10000] flex items-center gap-1.5"
          style={{
            left: eyedropperPreview.x,
            top: eyedropperPreview.y,
            transform: 'translate(0, -50%)',
          }}
        >
          <div
            className="w-9 h-9 rounded-md border-2 border-white shadow-lg ring-1 ring-black/25"
            style={{ backgroundColor: eyedropperPreview.color }}
          />
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/75 text-white shadow">
            {eyedropperPreview.color.toUpperCase()}
          </span>
        </div>
      )}
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${canvasTransform.translateX}px, ${canvasTransform.translateY}px) rotate(${canvasTransform.rotation}deg) scale(${canvasTransform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            className="bg-white cursor-crosshair block shadow-sm"
            style={{ touchAction: 'none', imageRendering: 'auto' }}
          />
          {/* Selection ants / handles — never written into layer or export bitmaps */}
          <canvas
            ref={selectionOverlayRef}
            className="pointer-events-none absolute inset-0"
            style={{ touchAction: 'none', imageRendering: 'pixelated', width: '100%', height: '100%' }}
            aria-hidden
          />
          {showSafeFrame && (
            <div
              className="pointer-events-none absolute inset-0 border-2 border-dashed border-blue-500 box-border"
              aria-hidden
            />
          )}
        </div>
      </div>
      {/* ??????- PS?????? */}
      {textInput && textInput.visible && canvasRef.current && containerRef.current && (
        <div
          ref={textInputContainerRef}
          className="absolute pointer-events-auto select-none"
          style={{
            left: `${canvasTransform.translateX + (textInput.x / canvasRef.current.width) * canvasRef.current.width * canvasTransform.scale}px`,
            top: `${canvasTransform.translateY + (textInput.y / canvasRef.current.height) * canvasRef.current.height * canvasTransform.scale}px`,
            transform: 'translate(-50%, -50%)',
          }}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.text-input-header') && !target.closest('button')) {
              e.preventDefault();
              e.stopPropagation();
              if (!canvasRef.current || !containerRef.current) return;
              
              const canvasRect = canvasRef.current.getBoundingClientRect();
              const clientX = e.clientX;
              const clientY = e.clientY;
              const scaleX = canvasRef.current.width / canvasRect.width;
              const scaleY = canvasRef.current.height / canvasRect.height;
              const x = (clientX - canvasRect.left) * scaleX;
              const y = (clientY - canvasRect.top) * scaleY;
              
              setTextInput({
                ...textInput,
                isDragging: true,
                dragOffset: {
                  x: x - textInput.x,
                  y: y - textInput.y,
                },
              });
            }
          }}
        >
          <div className="retro-window bg-white dark:bg-gray-900 min-w-[200px] max-w-[400px]">
            {/* ???? */}
            <div className="text-input-header retro-header p-1 cursor-move flex items-center justify-between">
              <span className="text-xs">{t('drawing.textTool.title')}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTextCancel();
                }}
                className="pixel-border-button px-1.5 py-0.5 text-xs hover:bg-gray-200 dark:hover:bg-gray-700"
                onMouseDown={(e) => e.stopPropagation()}
              >
                ?
              </button>
            </div>
            {/* ?????? */}
            <div className="p-2">
              <textarea
                ref={textInputRef}
                value={textInput.text}
                onChange={(e) => {
                  setTextInput({
                    ...textInput,
                    text: e.target.value,
                  });
                }}
                className="w-full border-2 border-black dark:border-white p-2 text-sm outline-none bg-transparent text-black dark:text-white resize-none font-mono"
                placeholder={t('drawing.textTool.placeholder')}
                style={{
                  fontSize: `${textInput.fontSize}px`,
                  lineHeight: '1.5',
                  minHeight: '60px',
                }}
                onKeyDown={(e) => {
                  // Ctrl+Enter ??Cmd+Enter ??
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleTextConfirm(textInput.text);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleTextCancel();
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                autoFocus
                rows={3}
              />
              {/* ?????? */}
              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {t('drawing.textTool.size')}
                </label>
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={textInput.fontSize}
                  onChange={(e) => {
                    setTextInput({
                      ...textInput,
                      fontSize: parseInt(e.target.value, 10),
                    });
                  }}
                  className="flex-1"
                />
                <input
                  type="number"
                  min="10"
                  max="200"
                  value={textInput.fontSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 10 && val <= 200) {
                      setTextInput({
                        ...textInput,
                        fontSize: val,
                      });
                    }
                  }}
                  className="w-16 border-2 border-black dark:border-white p-1 text-xs text-center bg-white dark:bg-gray-800 text-black dark:text-white"
                />
              </div>
              {/* ???? */}
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('drawing.textTool.hint')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  toX: number,
  toY: number,
  angle: number,
  headlen: number,
  filled: boolean
) {
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headlen * Math.cos(angle - Math.PI / 6),
    toY - headlen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headlen * Math.cos(angle + Math.PI / 6),
    toY - headlen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  if (filled) ctx.fill();
  else ctx.stroke();
}

function drawStraightLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  lineWidth: number
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  lineWidth: number,
  style: ArrowStyle = 'solid'
) {
  const headlen = Math.max(10, lineWidth * 3);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const backAngle = Math.atan2(fromY - toY, fromX - toX);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const endX = toX - headlen * Math.cos(angle);
  const endY = toY - headlen * Math.sin(angle);
  const startX = style === 'double' ? fromX - headlen * Math.cos(backAngle) : fromX;
  const startY = style === 'double' ? fromY - headlen * Math.sin(backAngle) : fromY;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  drawArrowHead(ctx, toX, toY, angle, headlen, style !== 'outline');
  if (style === 'double') {
    drawArrowHead(ctx, fromX, fromY, backAngle, headlen, true);
  }
  ctx.restore();
}

function drawRectMark(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  lineWidth: number
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.strokeRect(
    Math.min(x0, x1),
    Math.min(y0, y1),
    Math.abs(x1 - x0),
    Math.abs(y1 - y0)
  );
  ctx.restore();
}

function drawEllipseMark(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  lineWidth: number
) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCameraMark(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  lineWidth: number
) {
  // Arrow-like: body at stroke start, trapezoid lens points toward stroke end
  // Shape matches a simple camcorder icon: rounded square + outward-flaring lens
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const lw = Math.max(1, lineWidth);
  const scale = Math.max(16, lw * 4.5 + Math.min(dist * 0.2, 44));
  const body = scale * 0.9;
  const radius = Math.max(2, body * 0.14);
  const lensLen = scale * 0.55;
  const lensInnerHalf = body * 0.28;
  const lensOuterHalf = body * 0.52;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(x0, y0);
  ctx.rotate(angle);

  // Rounded square body, slightly left of origin so lens sits near center of mark
  const bx = -body * 0.55;
  const by = -body / 2;
  roundRectPath(ctx, bx, by, body, body, radius);
  ctx.stroke();

  // Trapezoid lens: narrow against body, wider toward look direction (+X)
  const lx0 = bx + body;
  const lx1 = lx0 + lensLen;
  ctx.beginPath();
  ctx.moveTo(lx0, -lensInnerHalf);
  ctx.lineTo(lx1, -lensOuterHalf);
  ctx.lineTo(lx1, lensOuterHalf);
  ctx.lineTo(lx0, lensInnerHalf);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
