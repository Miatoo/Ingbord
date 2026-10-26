import type { BrushTexture } from './DrawingTools';

export interface BrushPreset {
  id: string;
  labelKey: string;
  texture: BrushTexture;
  defaultSize: number;
  defaultOpacity: number;
  defaultSmoothness: number;
  pressure: boolean;
  stabilizer: number;
  sizePressure: number;
  opacityPressure: number;
  /** Absolute taper px (MoArt 入口 / 消除) */
  taperIn: number;
  taperOut: number;
  minSizeRatio: number;
  density?: number;
  tipSpacing?: number;
  scatter?: number;
  hardness?: number;
  tipAngle?: number;
  watercolorEdge?: boolean;
  edgeThickness?: number;
  edgeStrength?: number;
}

export const BRUSH_PRESETS: BrushPreset[] = [
  {
    id: 'hard',
    labelKey: 'hard',
    // 'normal' matches the original default annotation stroke (solid continuous ink)
    texture: 'normal',
    defaultSize: 3,
    defaultOpacity: 100,
    defaultSmoothness: 5,
    pressure: true,
    stabilizer: 2,
    sizePressure: 0.95,
    // Size pressure only — opacity pressure would wash out solid ink via flow crush
    opacityPressure: 0,
    taperIn: 0,
    taperOut: 0,
    minSizeRatio: 0.08,
    density: 1,
    tipSpacing: 0.15,
    scatter: 0,
    hardness: 0.9,
  },
  {
    id: 'soft',
    labelKey: 'soft',
    texture: 'soft',
    // Soft round: soft-edged circle — no scatter/jitter (unlike airbrush spray)
    defaultSize: 12,
    defaultOpacity: 70,
    defaultSmoothness: 7,
    pressure: true,
    stabilizer: 4,
    sizePressure: 0.7,
    opacityPressure: 0.8,
    taperIn: 0,
    taperOut: 0,
    minSizeRatio: 0.25,
    density: 1,
    tipSpacing: 0.15,
    scatter: 0,
    hardness: 0.22,
  },
  {
    id: 'gpen',
    labelKey: 'gpen',
    texture: 'hard',
    defaultSize: 3,
    defaultOpacity: 100,
    defaultSmoothness: 4,
    pressure: true,
    stabilizer: 3,
    sizePressure: 1,
    opacityPressure: 0.75,
    taperIn: 11,
    taperOut: 8,
    minSizeRatio: 0.08,
    density: 1,
    tipSpacing: 0.15,
    scatter: 0,
    hardness: 0.9,
  },
  {
    id: 'maru',
    labelKey: 'maru',
    texture: 'hard',
    defaultSize: 5,
    defaultOpacity: 100,
    defaultSmoothness: 5,
    pressure: true,
    stabilizer: 2,
    sizePressure: 0.55,
    opacityPressure: 0,
    taperIn: 1,
    taperOut: 2,
    minSizeRatio: 0.45,
    density: 1,
    tipSpacing: 0.18,
    scatter: 0,
    hardness: 0.95,
  },
  {
    id: 'pencil',
    labelKey: 'pencil',
    texture: 'pencil',
    defaultSize: 3,
    defaultOpacity: 85,
    defaultSmoothness: 4,
    pressure: true,
    stabilizer: 2,
    sizePressure: 0.75,
    opacityPressure: 0.35,
    taperIn: 3,
    taperOut: 4,
    minSizeRatio: 0.25,
    density: 0.95,
    tipSpacing: 0.1,
    scatter: 0.04,
    hardness: 0.62,
  },
  {
    id: 'marker',
    labelKey: 'marker',
    texture: 'marker',
    defaultSize: 10,
    defaultOpacity: 90,
    defaultSmoothness: 6,
    pressure: false,
    stabilizer: 1,
    sizePressure: 0,
    opacityPressure: 0,
    taperIn: 0,
    taperOut: 0,
    minSizeRatio: 0.9,
    density: 1,
    tipSpacing: 0.12,
    scatter: 0,
    hardness: 0.7,
  },
  {
    id: 'airbrush',
    labelKey: 'airbrush',
    texture: 'airbrush',
    defaultSize: 36,
    defaultOpacity: 40,
    defaultSmoothness: 6,
    pressure: true,
    stabilizer: 3,
    sizePressure: 0.55,
    opacityPressure: 0.8,
    taperIn: 4,
    taperOut: 6,
    minSizeRatio: 0.35,
    density: 0.85,
    tipSpacing: 0.18,
    scatter: 0.55,
    hardness: 0.08,
  },
  {
    id: 'calligraphy',
    labelKey: 'calligraphy',
    texture: 'calligraphy',
    defaultSize: 8,
    defaultOpacity: 100,
    defaultSmoothness: 5,
    pressure: true,
    stabilizer: 4,
    sizePressure: 0.95,
    opacityPressure: 0.2,
    taperIn: 8,
    taperOut: 12,
    minSizeRatio: 0.12,
    density: 1,
    tipSpacing: 0.16,
    scatter: 0,
    hardness: 0.6,
    tipAngle: 35,
  },
];

export type ArrowStyle = 'solid' | 'outline' | 'double';

export function getBrushPreset(id: string): BrushPreset | undefined {
  return BRUSH_PRESETS.find((p) => p.id === id);
}
