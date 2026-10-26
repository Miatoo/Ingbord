/**
 * Photoshop-aligned brush settings model.
 * Nested panels mirror PS Brush Settings; used by ABR import + stamp engine.
 */

export type PsControlSource =
  | 'off'
  | 'fade'
  | 'pressure'
  | 'tilt'
  | 'direction'
  | 'initialDirection'
  | 'rotation'
  | 'initialRotation';

export type PsDualBlendMode =
  | 'multiply'
  | 'darken'
  | 'colorBurn'
  | 'linearBurn'
  | 'overlay'
  | 'screen'
  | 'lighten';

export type PsTextureBlendMode = 'multiply' | 'darken' | 'colorBurn' | 'linearBurn' | 'overlay' | 'softLight';

export type PsTipShape = {
  sizePx: number;
  angleDeg: number;
  roundnessPercent: number;
  hardnessPercent: number;
  spacingPercent: number;
  flipX: boolean;
  flipY: boolean;
};

export type PsShapeDynamics = {
  enabled: boolean;
  sizeJitterPercent: number;
  sizeControl: PsControlSource;
  minDiameterPercent: number;
  tiltScalePercent: number;
  angleJitterPercent: number;
  angleControl: PsControlSource;
  roundnessJitterPercent: number;
  roundnessControl: PsControlSource;
  minRoundnessPercent: number;
  flipXJitter: boolean;
  flipYJitter: boolean;
  brushProjection: boolean;
};

export type PsScattering = {
  enabled: boolean;
  scatterPercent: number;
  bothAxes: boolean;
  scatterControl: PsControlSource;
  count: number;
  countJitterPercent: number;
  countControl: PsControlSource;
};

export type PsTexture = {
  enabled: boolean;
  /** Pattern grayscale data URL (or empty → procedural grain). */
  patternDataUrl?: string;
  invert: boolean;
  scalePercent: number;
  brightness: number;
  contrast: number;
  textureEachTip: boolean;
  mode: PsTextureBlendMode;
  depthPercent: number;
  minDepthPercent: number;
  depthJitterPercent: number;
  depthControl: PsControlSource;
};

export type PsDualBrush = {
  enabled: boolean;
  mode: PsDualBlendMode;
  flip: boolean;
  /** Second tip data URL */
  tipDataUrl?: string;
  sizePx: number;
  spacingPercent: number;
  scatterPercent: number;
  bothAxes: boolean;
  count: number;
  countJitterPercent: number;
};

export type PsSmoothing = {
  enabled: boolean;
  /** 0–100 PS-like smoothing strength (mapped to stabilizer lag). */
  strengthPercent: number;
};

export type PsTransfer = {
  enabled: boolean;
  opacityJitterPercent: number;
  opacityControl: PsControlSource;
  minOpacityPercent: number;
  flowJitterPercent: number;
  flowControl: PsControlSource;
  minFlowPercent: number;
};

export type PsColorDynamics = {
  enabled: boolean;
  foregroundBackgroundJitterPercent: number;
  hueJitterPercent: number;
  saturationJitterPercent: number;
  brightnessJitterPercent: number;
};

export type PsBrushPose = {
  enabled: boolean;
  overrideAngle: boolean;
  overrideTiltX: boolean;
  overrideTiltY: boolean;
  overridePressure: boolean;
  angleDeg: number;
  tiltXPercent: number;
  tiltYPercent: number;
  pressurePercent: number;
};

export type PsMiscFlags = {
  noise: boolean;
  wetEdges: boolean;
  buildUp: boolean;
  protectTexture: boolean;
};

export type PsBrushSettings = {
  tipShape: PsTipShape;
  shapeDynamics: PsShapeDynamics;
  scattering: PsScattering;
  texture: PsTexture;
  dualBrush: PsDualBrush;
  smoothing: PsSmoothing;
  transfer: PsTransfer;
  colorDynamics: PsColorDynamics;
  brushPose: PsBrushPose;
  misc: PsMiscFlags;
};

export function defaultPsTipShape(partial?: Partial<PsTipShape>): PsTipShape {
  return {
    sizePx: 72,
    angleDeg: 0,
    roundnessPercent: 100,
    hardnessPercent: 100,
    spacingPercent: 25,
    flipX: false,
    flipY: false,
    ...partial,
  };
}

export function defaultPsShapeDynamics(partial?: Partial<PsShapeDynamics>): PsShapeDynamics {
  return {
    enabled: false,
    sizeJitterPercent: 0,
    sizeControl: 'off',
    minDiameterPercent: 0,
    tiltScalePercent: 0,
    angleJitterPercent: 0,
    angleControl: 'off',
    roundnessJitterPercent: 0,
    roundnessControl: 'off',
    minRoundnessPercent: 25,
    flipXJitter: false,
    flipYJitter: false,
    brushProjection: false,
    ...partial,
  };
}

export function defaultPsScattering(partial?: Partial<PsScattering>): PsScattering {
  return {
    enabled: false,
    scatterPercent: 0,
    bothAxes: false,
    scatterControl: 'off',
    count: 1,
    countJitterPercent: 0,
    countControl: 'off',
    ...partial,
  };
}

export function defaultPsTexture(partial?: Partial<PsTexture>): PsTexture {
  return {
    enabled: false,
    invert: false,
    scalePercent: 100,
    brightness: 0,
    contrast: 0,
    textureEachTip: false,
    mode: 'multiply',
    depthPercent: 100,
    minDepthPercent: 0,
    depthJitterPercent: 0,
    depthControl: 'off',
    ...partial,
  };
}

export function defaultPsDualBrush(partial?: Partial<PsDualBrush>): PsDualBrush {
  return {
    enabled: false,
    mode: 'multiply',
    flip: false,
    sizePx: 50,
    spacingPercent: 25,
    scatterPercent: 0,
    bothAxes: false,
    count: 1,
    countJitterPercent: 0,
    ...partial,
  };
}

export function defaultPsSmoothing(partial?: Partial<PsSmoothing>): PsSmoothing {
  return {
    enabled: false,
    strengthPercent: 10,
    ...partial,
  };
}

export function defaultPsTransfer(partial?: Partial<PsTransfer>): PsTransfer {
  return {
    enabled: false,
    opacityJitterPercent: 0,
    opacityControl: 'off',
    minOpacityPercent: 0,
    flowJitterPercent: 0,
    flowControl: 'off',
    minFlowPercent: 0,
    ...partial,
  };
}

export function defaultPsColorDynamics(partial?: Partial<PsColorDynamics>): PsColorDynamics {
  return {
    enabled: false,
    foregroundBackgroundJitterPercent: 0,
    hueJitterPercent: 0,
    saturationJitterPercent: 0,
    brightnessJitterPercent: 0,
    ...partial,
  };
}

export function defaultPsBrushPose(partial?: Partial<PsBrushPose>): PsBrushPose {
  return {
    enabled: false,
    overrideAngle: false,
    overrideTiltX: false,
    overrideTiltY: false,
    overridePressure: false,
    angleDeg: 0,
    tiltXPercent: 0,
    tiltYPercent: 0,
    pressurePercent: 100,
    ...partial,
  };
}

export function defaultPsMisc(partial?: Partial<PsMiscFlags>): PsMiscFlags {
  return {
    noise: false,
    wetEdges: false,
    buildUp: false,
    protectTexture: false,
    ...partial,
  };
}

export function createDefaultPsBrushSettings(partial?: Partial<PsBrushSettings>): PsBrushSettings {
  return {
    tipShape: defaultPsTipShape(partial?.tipShape),
    shapeDynamics: defaultPsShapeDynamics(partial?.shapeDynamics),
    scattering: defaultPsScattering(partial?.scattering),
    texture: defaultPsTexture(partial?.texture),
    dualBrush: defaultPsDualBrush(partial?.dualBrush),
    smoothing: defaultPsSmoothing(partial?.smoothing),
    transfer: defaultPsTransfer(partial?.transfer),
    colorDynamics: defaultPsColorDynamics(partial?.colorDynamics),
    brushPose: defaultPsBrushPose(partial?.brushPose),
    misc: defaultPsMisc(partial?.misc),
  };
}

/**
 * Gold-standard reference brush from user PS screenshots
 * (tip 72 / spacing 34% + dynamics + scatter 40% + texture + dual colorBurn + smoothing).
 */
export const REFERENCE_PS_BRUSH: PsBrushSettings = createDefaultPsBrushSettings({
  tipShape: {
    sizePx: 72,
    angleDeg: 0,
    roundnessPercent: 100,
    hardnessPercent: 0,
    spacingPercent: 34,
    flipX: false,
    flipY: false,
  },
  shapeDynamics: {
    enabled: true,
    sizeJitterPercent: 0,
    sizeControl: 'pressure',
    minDiameterPercent: 0,
    tiltScalePercent: 0,
    angleJitterPercent: 0,
    angleControl: 'direction',
    roundnessJitterPercent: 0,
    roundnessControl: 'off',
    minRoundnessPercent: 25,
    flipXJitter: false,
    flipYJitter: false,
    brushProjection: false,
  },
  scattering: {
    enabled: true,
    scatterPercent: 40,
    bothAxes: false,
    scatterControl: 'off',
    count: 1,
    countJitterPercent: 0,
    countControl: 'off',
  },
  texture: {
    enabled: true,
    invert: true,
    scalePercent: 91,
    brightness: 83,
    contrast: 67,
    textureEachTip: false,
    mode: 'darken',
    depthPercent: 7,
    minDepthPercent: 0,
    depthJitterPercent: 0,
    depthControl: 'off',
  },
  dualBrush: {
    enabled: true,
    mode: 'colorBurn',
    flip: false,
    sizePx: 120,
    spacingPercent: 58,
    scatterPercent: 167,
    bothAxes: true,
    count: 1,
    countJitterPercent: 0,
  },
  smoothing: {
    enabled: true,
    strengthPercent: 35,
  },
});

/** Map PS tip spacing % → engine tipSpacing (fraction of diameter). */
export function psSpacingToTipSpacing(spacingPercent: number): number {
  const p = Math.max(1, Math.min(400, spacingPercent));
  return Math.max(0.04, Math.min(2.5, p / 100));
}

/** Map PS scatter % → engine scatter factor (legacy slider ~0–1). */
export function psScatterToEngine(scatterPercent: number): number {
  return Math.max(0, Math.min(4, scatterPercent / 100));
}

/** Derive legacy BrushTuning-ish flat fields from PsBrushSettings for UI sync. */
export function psToLegacyFlat(ps: PsBrushSettings): {
  tipSpacing: number;
  scatter: number;
  hardness: number;
  tipAngle: number;
  thickness: number;
  sizePressure: number;
  minSizeRatio: number;
  directionMode: 'none' | 'stroke' | 'pen';
  sizeJitter: number;
  angleJitter: number;
  stabilizer: number;
  tipSpacingAuto: boolean;
  textureStrength: number;
  watercolorEdge: boolean;
} {
  const dyn = ps.shapeDynamics;
  const sizePressure =
    dyn.enabled && dyn.sizeControl === 'pressure' ? 1 : dyn.enabled && dyn.sizeControl !== 'off' ? 0.6 : 0;
  const directionMode: 'none' | 'stroke' | 'pen' =
    dyn.enabled && dyn.angleControl === 'direction'
      ? 'stroke'
      : dyn.enabled && dyn.angleControl === 'tilt'
        ? 'pen'
        : 'none';
  return {
    tipSpacing: psSpacingToTipSpacing(ps.tipShape.spacingPercent),
    scatter: ps.scattering.enabled ? psScatterToEngine(ps.scattering.scatterPercent) : 0,
    hardness: Math.max(0.02, Math.min(1, ps.tipShape.hardnessPercent / 100)),
    tipAngle: ps.tipShape.angleDeg,
    thickness: Math.max(0.08, Math.min(1, ps.tipShape.roundnessPercent / 100)),
    sizePressure,
    minSizeRatio: dyn.enabled ? Math.max(0.02, dyn.minDiameterPercent / 100) : 0.12,
    directionMode,
    sizeJitter: dyn.enabled ? dyn.sizeJitterPercent / 100 : 0,
    angleJitter: dyn.enabled ? dyn.angleJitterPercent * 3.6 : 0,
    stabilizer: ps.smoothing.enabled ? Math.max(1, (ps.smoothing.strengthPercent / 100) * 8) : 2,
    tipSpacingAuto: false,
    textureStrength: ps.texture.enabled ? Math.max(0.05, ps.texture.depthPercent / 100) : 0,
    watercolorEdge: ps.misc.wetEdges,
  };
}
