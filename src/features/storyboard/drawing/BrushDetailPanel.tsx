import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';
import type { BrushTexture, BrushTuning } from './DrawingTools';
import { BRUSH_TEXTURE_OPTIONS } from './DrawingTools';
import {
  createDefaultPsBrushSettings,
  psToLegacyFlat,
  type PsBrushSettings,
  type PsControlSource,
  type PsDualBlendMode,
  type PsTextureBlendMode,
} from './psBrushSettings';

/** Tip-shape only scaffold — optional panels stay off until PS preset or user enables them. */
function ensureEngineSettings(tuning: BrushTuning, liveSizePx: number): PsBrushSettings {
  if (tuning.ps) return structuredClone(tuning.ps);
  const sizePx = Math.max(1, Math.min(500, Math.round(liveSizePx) || 3));
  return createDefaultPsBrushSettings({
    tipShape: {
      sizePx,
      angleDeg: tuning.tipAngle,
      roundnessPercent: Math.round(tuning.thickness * 100),
      hardnessPercent: Math.round(tuning.hardness * 100),
      spacingPercent: Math.round(tuning.tipSpacing * 100),
      flipX: false,
      flipY: false,
    },
    // Do not invent shape dynamics / scatter / smoothing / wet edges from legacy sliders
    shapeDynamics: { enabled: false },
    scattering: { enabled: false, scatterPercent: 0 },
    texture: { enabled: false },
    dualBrush: { enabled: false },
    smoothing: { enabled: false, strengthPercent: 10 },
    transfer: { enabled: false },
    colorDynamics: { enabled: false },
    misc: {
      noise: false,
      wetEdges: false,
      buildUp: false,
      protectTexture: false,
    },
  });
}

function syncFlatFromEngine(ps: PsBrushSettings): Partial<BrushTuning> {
  const flat = psToLegacyFlat(ps);
  return {
    ps,
    tipSpacing: flat.tipSpacing,
    scatter: flat.scatter,
    hardness: flat.hardness,
    tipAngle: flat.tipAngle,
    thickness: flat.thickness,
    sizePressure: flat.sizePressure,
    minSizeRatio: flat.minSizeRatio,
    directionMode: flat.directionMode,
    sizeJitter: flat.sizeJitter,
    angleJitter: flat.angleJitter,
    stabilizer: flat.stabilizer,
    tipSpacingAuto: false,
    textureStrength: flat.textureStrength,
    watercolorEdge: flat.watercolorEdge,
  };
}

function ImagePickRow({
  label,
  previewUrl,
  onPickFile,
  onClear,
}: {
  label: string;
  previewUrl?: string | null;
  onPickFile: (file: File) => void;
  onClear?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[11px] theme-muted shrink-0 w-[4.5rem] leading-tight">{label}</span>
      <button
        type="button"
        className="w-10 h-10 rounded pixel-border-button bg-white flex items-center justify-center overflow-hidden shrink-0"
        onClick={() => inputRef.current?.click()}
        title={t('drawing.pickImage')}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-[14px] theme-muted">+</span>
        )}
      </button>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <button
          type="button"
          className="h-6 rounded text-[9px] pixel-border-button"
          onClick={() => inputRef.current?.click()}
        >
          {t('drawing.pickImage')}
        </button>
        {previewUrl && onClear && (
          <button type="button" className="h-6 rounded text-[9px] pixel-border-button" onClick={onClear}>
            {t('drawing.clearImage')}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Single brush settings sheet — one model for all brushes. */
export function BrushDetailPanel({
  brushTuning,
  onBrushTuningChange,
  currentBrushSize = 3,
  brushTexture,
  onBrushTextureChange,
  dualTipPreviewUrl,
  texturePatternPreviewUrl,
  onDualTipImageFile,
  onTexturePatternFile,
  onClearDualTip,
  onClearTexturePattern,
  onResetToPreset,
}: {
  brushTuning: BrushTuning;
  onBrushTuningChange: (partial: Partial<BrushTuning>) => void;
  /** Live dock size — used when scaffolding PS tip so opening detail does not jump to 72px */
  currentBrushSize?: number;
  brushTexture?: BrushTexture;
  onBrushTextureChange?: (t: BrushTexture) => void;
  dualTipPreviewUrl?: string | null;
  texturePatternPreviewUrl?: string | null;
  onDualTipImageFile?: (file: File) => void;
  onTexturePatternFile?: (file: File) => void;
  onClearDualTip?: () => void;
  onClearTexturePattern?: () => void;
  /** Discard session tweaks; reload builtin / ABR pack stored settings. */
  onResetToPreset?: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!brushTuning.ps) {
      // Attach tip-shape scaffold only — do not syncFlat (would zero pressure / invent panels)
      onBrushTuningChange({ ps: ensureEngineSettings(brushTuning, currentBrushSize) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brushTuning.ps, currentBrushSize]);

  const ps = brushTuning.ps ?? ensureEngineSettings(brushTuning, currentBrushSize);

  const patch = (mutator: (draft: PsBrushSettings) => void) => {
    const draft = ensureEngineSettings(brushTuning, currentBrushSize);
    mutator(draft);
    onBrushTuningChange(syncFlatFromEngine(draft));
  };

  const section = (
    title: string,
    enabled: boolean | undefined,
    onToggle: ((v: boolean) => void) | null,
    body: ReactNode
  ) => (
    <div className="border-t theme-divider pt-1 mt-1">
      <label className="flex items-center justify-between text-[11px] py-1 theme-text">
        <span className="font-semibold pr-2">{title}</span>
        {onToggle != null && enabled != null && (
          <input
            type="checkbox"
            className="paint-check shrink-0"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
        )}
      </label>
      {(enabled === undefined || enabled) && body}
    </div>
  );

  const num = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    suffix = ''
  ) => (
    <label className="block text-[11px] py-0.5 theme-text">
      <div className="flex justify-between theme-muted mb-0.5">
        <span>{label}</span>
        <span>
          {max <= 1 && step < 1
            ? `${Math.round(value * 100)}%`
            : `${Number(value.toFixed(step < 1 ? 2 : 0))}${suffix}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full paint-range"
      />
    </label>
  );

  const controlSelect = (label: string, value: PsControlSource, onChange: (v: PsControlSource) => void) => (
    <label className="flex items-center justify-between text-[11px] py-0.5 gap-2 theme-text">
      <span className="theme-muted shrink-0">{label}</span>
      <select
        className="flex-1 h-6 text-[10px] rounded pixel-border-button bg-transparent"
        value={value}
        onChange={(e) => onChange(e.target.value as PsControlSource)}
      >
        {(['off', 'fade', 'pressure', 'tilt', 'direction', 'initialDirection'] as PsControlSource[]).map((c) => (
          <option key={c} value={c}>
            {t(`drawing.control.${c}` as 'drawing.control.off')}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="paint-dock w-[268px] p-2 space-y-0.5 theme-text max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] uppercase theme-muted font-semibold">{t('drawing.brushDetail')}</p>
        {onResetToPreset && (
          <button
            type="button"
            className="h-6 px-1.5 rounded text-[9px] pixel-border-button shrink-0"
            title={t('drawing.resetBrushPresetHint')}
            onClick={onResetToPreset}
          >
            {t('drawing.resetBrushPreset')}
          </button>
        )}
      </div>

      {onBrushTextureChange && brushTexture != null && (
        <div className="pb-1">
          <div className="text-[10px] theme-muted mb-1">{t('drawing.brushStyle')}</div>
          <div className="grid grid-cols-3 gap-0.5">
            {BRUSH_TEXTURE_OPTIONS.map((tex) => (
              <button
                key={tex}
                type="button"
                className={`h-6 rounded text-[9px] pixel-border-button ${brushTexture === tex ? 'is-active' : ''}`}
                onClick={() => onBrushTextureChange(tex)}
              >
                {t(`drawing.texture.${tex}` as 'drawing.texture.hard')}
              </button>
            ))}
          </div>
        </div>
      )}

      {section(t('drawing.tipShape'), undefined, null, (
        <>
          {num(t('drawing.brushSize'), ps.tipShape.sizePx, 1, 500, 1, (v) =>
            patch((d) => {
              d.tipShape.sizePx = v;
            }), 'px')}
          {num(t('drawing.tipSpacing'), ps.tipShape.spacingPercent, 1, 200, 1, (v) =>
            patch((d) => {
              d.tipShape.spacingPercent = v;
            }), '%')}
          {num(t('drawing.tipAngle'), ps.tipShape.angleDeg, 0, 360, 1, (v) =>
            patch((d) => {
              d.tipShape.angleDeg = v;
            }), '°')}
          {num(t('drawing.thickness'), ps.tipShape.roundnessPercent, 1, 100, 1, (v) =>
            patch((d) => {
              d.tipShape.roundnessPercent = v;
            }), '%')}
          {num(t('drawing.hardness'), ps.tipShape.hardnessPercent / 100, 0.02, 1, 0.01, (v) =>
            patch((d) => {
              d.tipShape.hardnessPercent = v * 100;
            }))}
          <label className="flex items-center justify-between text-[11px] py-1">
            <span>{t('drawing.flipX')}</span>
            <input
              type="checkbox"
              className="paint-check"
              checked={ps.tipShape.flipX}
              onChange={(e) =>
                patch((d) => {
                  d.tipShape.flipX = e.target.checked;
                })
              }
            />
          </label>
          <label className="flex items-center justify-between text-[11px] py-1">
            <span>{t('drawing.flipY')}</span>
            <input
              type="checkbox"
              className="paint-check"
              checked={ps.tipShape.flipY}
              onChange={(e) =>
                patch((d) => {
                  d.tipShape.flipY = e.target.checked;
                })
              }
            />
          </label>
        </>
      ))}

      {section(
        t('drawing.shapeDynamics'),
        ps.shapeDynamics.enabled,
        (v) =>
          patch((d) => {
            d.shapeDynamics.enabled = v;
          }),
        <>
          {num(t('drawing.sizeJitter'), ps.shapeDynamics.sizeJitterPercent, 0, 100, 1, (v) =>
            patch((d) => {
              d.shapeDynamics.sizeJitterPercent = v;
            }), '%')}
          {controlSelect(t('drawing.sizeControl'), ps.shapeDynamics.sizeControl, (v) =>
            patch((d) => {
              d.shapeDynamics.sizeControl = v;
            }))}
          {num(t('drawing.minSizeRatio'), ps.shapeDynamics.minDiameterPercent, 0, 100, 1, (v) =>
            patch((d) => {
              d.shapeDynamics.minDiameterPercent = v;
            }), '%')}
          {num(t('drawing.angleJitter'), ps.shapeDynamics.angleJitterPercent, 0, 100, 1, (v) =>
            patch((d) => {
              d.shapeDynamics.angleJitterPercent = v;
            }), '%')}
          {controlSelect(t('drawing.angleControl'), ps.shapeDynamics.angleControl, (v) =>
            patch((d) => {
              d.shapeDynamics.angleControl = v;
            }))}
        </>
      )}

      {section(
        t('drawing.scattering'),
        ps.scattering.enabled,
        (v) =>
          patch((d) => {
            d.scattering.enabled = v;
          }),
        <>
          {num(t('drawing.scatter'), ps.scattering.scatterPercent, 0, 1000, 1, (v) =>
            patch((d) => {
              d.scattering.scatterPercent = v;
            }), '%')}
          <label className="flex items-center justify-between text-[11px] py-1">
            <span>{t('drawing.bothAxes')}</span>
            <input
              type="checkbox"
              className="paint-check"
              checked={ps.scattering.bothAxes}
              onChange={(e) =>
                patch((d) => {
                  d.scattering.bothAxes = e.target.checked;
                })
              }
            />
          </label>
          {num(t('drawing.count'), ps.scattering.count, 1, 16, 1, (v) =>
            patch((d) => {
              d.scattering.count = v;
            }))}
        </>
      )}

      {section(
        t('drawing.texturePanel'),
        ps.texture.enabled,
        (v) =>
          patch((d) => {
            d.texture.enabled = v;
          }),
        <>
          {onTexturePatternFile && (
            <ImagePickRow
              label={t('drawing.textureImage')}
              previewUrl={texturePatternPreviewUrl}
              onPickFile={onTexturePatternFile}
              onClear={onClearTexturePattern}
            />
          )}
          <label className="flex items-center justify-between text-[11px] py-1">
            <span>{t('drawing.invert')}</span>
            <input
              type="checkbox"
              className="paint-check"
              checked={ps.texture.invert}
              onChange={(e) =>
                patch((d) => {
                  d.texture.invert = e.target.checked;
                })
              }
            />
          </label>
          {num(t('drawing.scale'), ps.texture.scalePercent, 1, 400, 1, (v) =>
            patch((d) => {
              d.texture.scalePercent = v;
            }), '%')}
          {num(t('drawing.brightness'), ps.texture.brightness, 0, 100, 1, (v) =>
            patch((d) => {
              d.texture.brightness = v;
            }))}
          {num(t('drawing.contrast'), ps.texture.contrast, 0, 100, 1, (v) =>
            patch((d) => {
              d.texture.contrast = v;
            }))}
          {num(t('drawing.depth'), ps.texture.depthPercent, 0, 100, 1, (v) =>
            patch((d) => {
              d.texture.depthPercent = v;
            }), '%')}
          <label className="flex items-center justify-between text-[11px] py-0.5 gap-2">
            <span className="theme-muted">{t('drawing.blendMode')}</span>
            <select
              className="flex-1 h-6 text-[10px] rounded pixel-border-button bg-transparent"
              value={ps.texture.mode}
              onChange={(e) =>
                patch((d) => {
                  d.texture.mode = e.target.value as PsTextureBlendMode;
                })
              }
            >
              {(['multiply', 'darken', 'colorBurn', 'linearBurn', 'overlay', 'softLight'] as PsTextureBlendMode[]).map(
                (m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                )
              )}
            </select>
          </label>
        </>
      )}

      {section(
        t('drawing.dualBrush'),
        ps.dualBrush.enabled,
        (v) =>
          patch((d) => {
            d.dualBrush.enabled = v;
          }),
        <>
          {onDualTipImageFile && (
            <ImagePickRow
              label={t('drawing.dualTip')}
              previewUrl={dualTipPreviewUrl}
              onPickFile={onDualTipImageFile}
              onClear={onClearDualTip}
            />
          )}
          <label className="flex items-center justify-between text-[11px] py-0.5 gap-2">
            <span className="theme-muted">{t('drawing.blendMode')}</span>
            <select
              className="flex-1 h-6 text-[10px] rounded pixel-border-button bg-transparent"
              value={ps.dualBrush.mode}
              onChange={(e) =>
                patch((d) => {
                  d.dualBrush.mode = e.target.value as PsDualBlendMode;
                })
              }
            >
              {(
                ['multiply', 'darken', 'colorBurn', 'linearBurn', 'overlay', 'screen', 'lighten'] as PsDualBlendMode[]
              ).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {num(t('drawing.brushSize'), ps.dualBrush.sizePx, 1, 500, 1, (v) =>
            patch((d) => {
              d.dualBrush.sizePx = v;
            }), 'px')}
          {num(t('drawing.tipSpacing'), ps.dualBrush.spacingPercent, 1, 200, 1, (v) =>
            patch((d) => {
              d.dualBrush.spacingPercent = v;
            }), '%')}
          {num(t('drawing.scatter'), ps.dualBrush.scatterPercent, 0, 1000, 1, (v) =>
            patch((d) => {
              d.dualBrush.scatterPercent = v;
            }), '%')}
          <label className="flex items-center justify-between text-[11px] py-1">
            <span>{t('drawing.bothAxes')}</span>
            <input
              type="checkbox"
              className="paint-check"
              checked={ps.dualBrush.bothAxes}
              onChange={(e) =>
                patch((d) => {
                  d.dualBrush.bothAxes = e.target.checked;
                })
              }
            />
          </label>
        </>
      )}

      {section(
        t('drawing.smoothing'),
        ps.smoothing.enabled,
        (v) =>
          patch((d) => {
            d.smoothing.enabled = v;
          }),
        num(t('drawing.stabilizer'), ps.smoothing.strengthPercent, 0, 100, 1, (v) =>
          patch((d) => {
            d.smoothing.strengthPercent = v;
          }), '%')
      )}

      <div className="border-t theme-divider pt-1 mt-1 text-[10px] theme-muted">{t('drawing.strokeExtras')}</div>
      {num(t('drawing.taperIn'), brushTuning.taperIn, 0, 80, 1, (v) => onBrushTuningChange({ taperIn: v }), 'px')}
      {num(t('drawing.taperOut'), brushTuning.taperOut, 0, 80, 1, (v) => onBrushTuningChange({ taperOut: v }), 'px')}
      {num(t('drawing.flow'), brushTuning.flow, 0, 1, 0.01, (v) => onBrushTuningChange({ flow: v }))}
      {num(t('drawing.density'), brushTuning.density, 0, 1, 0.01, (v) => onBrushTuningChange({ density: v }))}
      <label className="flex items-center justify-between text-[11px] py-1">
        <span>{t('drawing.binarize')}</span>
        <input
          type="checkbox"
          className="paint-check"
          checked={brushTuning.binarize}
          onChange={(e) => onBrushTuningChange({ binarize: e.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between text-[11px] py-1">
        <span>{t('drawing.watercolorEdge')}</span>
        <input
          type="checkbox"
          className="paint-check"
          checked={ps.misc.wetEdges}
          onChange={(e) =>
            patch((d) => {
              d.misc.wetEdges = e.target.checked;
            })
          }
        />
      </label>
      <label className="flex items-center justify-between text-[11px] py-1">
        <span>{t('drawing.noise')}</span>
        <input
          type="checkbox"
          className="paint-check"
          checked={ps.misc.noise}
          onChange={(e) =>
            patch((d) => {
              d.misc.noise = e.target.checked;
            })
          }
        />
      </label>
    </div>
  );
}
