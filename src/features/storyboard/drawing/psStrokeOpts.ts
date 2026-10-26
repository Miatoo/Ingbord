/**
 * Map PsBrushSettings (+ tip images) → PressureStrokeOptions fields.
 * Only returns defined keys so merge never wipes legacy base with `undefined`.
 */
import type { PressureStrokeOptions, TextureStrokeOpts, DualBrushStrokeOpts } from './brushEngine';
import {
  type PsBrushSettings,
  psScatterToEngine,
  psSpacingToTipSpacing,
} from './psBrushSettings';

export type PsStrokeImages = {
  dualTip?: CanvasImageSource | null;
  texturePattern?: CanvasImageSource | null;
};

function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/** Build engine overrides from PS settings. Merge onto base PressureStrokeOptions. */
export function psSettingsToStrokePartial(
  ps: PsBrushSettings,
  images: PsStrokeImages = {}
): Partial<PressureStrokeOptions> {
  const tip = ps.tipShape;
  const dyn = ps.shapeDynamics;
  const sc = ps.scattering;
  const tex = ps.texture;
  const dual = ps.dualBrush;
  const tr = ps.transfer;
  const cd = ps.colorDynamics;
  const pose = ps.brushPose;
  const misc = ps.misc;

  const partial: Partial<PressureStrokeOptions> = {
    tipSpacing: psSpacingToTipSpacing(tip.spacingPercent),
    tipAngleDeg: pose.enabled && pose.overrideAngle ? pose.angleDeg : tip.angleDeg,
    roundness: Math.max(0.08, Math.min(1, tip.roundnessPercent / 100)),
    // Sampled tips ignore hardness for shape; keep for radial fallback
    hardness: Math.max(0.02, Math.min(1, (tip.hardnessPercent || 50) / 100)),
    flipX: tip.flipX,
    flipY: tip.flipY,
    noise: misc.noise,
    wetEdge: misc.wetEdges,
    buildUp: misc.buildUp,
  };

  if (dyn.enabled) {
    if (dyn.sizeControl === 'pressure') partial.sizePressure = 1;
    else if (dyn.sizeControl !== 'off') partial.sizePressure = 0.65;
    // else leave base sizePressure alone

    partial.minSizeRatio = Math.max(0.02, (dyn.minDiameterPercent || 0) / 100 || 0.02);
    partial.sizeJitter = dyn.sizeJitterPercent / 100;
    partial.angleJitter = dyn.angleJitterPercent * 3.6;
    partial.roundnessJitter = dyn.roundnessJitterPercent / 100;
    partial.flipXJitter = dyn.flipXJitter;
    partial.flipYJitter = dyn.flipYJitter;

    if (dyn.angleControl === 'direction') partial.directionMode = 'stroke';
    else if (dyn.angleControl === 'tilt' || dyn.angleControl === 'rotation') {
      partial.directionMode = 'pen';
    }
  } else {
    partial.sizeJitter = 0;
    partial.angleJitter = 0;
    partial.roundnessJitter = 0;
    partial.flipXJitter = false;
    partial.flipYJitter = false;
  }

  if (pose.enabled && pose.overridePressure) {
    partial.sizePressure = 0;
  }
  if (pose.enabled && pose.overrideAngle) {
    partial.directionMode = 'none';
    partial.tipAngleDeg = pose.angleDeg;
  }

  if (sc.enabled) {
    partial.scatter = psScatterToEngine(sc.scatterPercent);
    partial.scatterBothAxes = sc.bothAxes;
    partial.scatterCount = Math.max(1, sc.count);
  } else {
    partial.scatter = 0;
    partial.scatterBothAxes = false;
    partial.scatterCount = 1;
  }

  // Dual: prefer dedicated tip; fall back to main tip image if dual enabled without second tip
  if (dual.enabled) {
    const dualSrc = images.dualTip ?? null;
    if (dualSrc) {
      const dualOpts: DualBrushStrokeOpts = {
        tipImage: dualSrc,
        sizePx: dual.sizePx,
        spacing: dual.spacingPercent / 100,
        scatter: dual.scatterPercent / 100,
        bothAxes: dual.bothAxes,
        count: Math.max(1, dual.count),
        mode: dual.mode,
        flip: dual.flip,
      };
      partial.dual = dualOpts;
    }
  } else {
    partial.dual = null;
  }

  if (tex.enabled) {
    const depth = misc.protectTexture
      ? Math.max(tex.depthPercent, 7)
      : tex.depthPercent;
    const psTexture: TextureStrokeOpts = {
      pattern: images.texturePattern ?? null,
      invert: tex.invert,
      scalePercent: tex.scalePercent,
      brightness: tex.brightness,
      contrast: tex.contrast,
      textureEachTip: tex.textureEachTip,
      mode: tex.mode,
      depthPercent: depth,
    };
    partial.psTexture = psTexture;
    partial.textureStrength = Math.max(0.05, depth / 100);
  } else {
    partial.psTexture = null;
    partial.textureStrength = 0;
  }

  if (tr.enabled) {
    if (tr.opacityControl === 'pressure') partial.opacityPressure = 1;
    else if (tr.opacityControl !== 'off') partial.opacityPressure = 0.7;
    if (tr.flowControl !== 'pressure') {
      partial.flow = Math.max(0.05, 1 - tr.flowJitterPercent / 200);
    }
  }

  if (cd.enabled) {
    partial.hueJitterDeg = cd.hueJitterPercent * 1.8;
    partial.saturationJitter = cd.saturationJitterPercent / 100;
    partial.brightnessJitter = cd.brightnessJitterPercent / 100;
  } else {
    partial.hueJitterDeg = 0;
    partial.saturationJitter = 0;
    partial.brightnessJitter = 0;
  }

  return definedOnly(partial as Record<string, unknown>) as Partial<PressureStrokeOptions>;
}
