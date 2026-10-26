import { useEffect, useRef, useState } from 'react';
import { ColorWheel } from './ColorWheel';
import { useTranslation } from '../../../i18n/useTranslation';
import { UiIcon } from '../components/UiIcon';
import { BRUSH_PRESETS, type ArrowStyle } from './brushPresets';
import type { PsBrushSettings } from './psBrushSettings';

export type DrawingTool =
  | 'brush'
  | 'eraser'
  | 'arrow'
  | 'line'
  | 'text'
  | 'select'
  | 'lasso'
  | 'lassoFill'
  | 'move'
  | 'scale'
  | 'fill'
  | 'rect'
  | 'ellipse'
  | 'camera'
  | 'eyedropper';

export type BrushTexture = 'normal' | 'hard' | 'soft' | 'pencil' | 'marker' | 'airbrush' | 'calligraphy';

export interface BrushTuning {
  stabilizer: number;
  sizePressure: number;
  opacityPressureStrength: number;
  /** Start taper in px (MoArt 入口) */
  taperIn: number;
  /** End taper in px (MoArt 消除) */
  taperOut: number;
  minSizeRatio: number;
  density: number;
  tipSpacing: number;
  scatter: number;
  hardness: number;
  tipAngle: number;
  speedTaper: boolean;
  directionMode: 'none' | 'stroke' | 'pen';
  watercolorEdge: boolean;
  edgeThickness: number;
  edgeStrength: number;
  flow: number;
  thickness: number;
  binarize: boolean;
  edgeDarkness: number;
  edgeBlur: number;
  sizeJitter: number;
  angleJitter: number;
  densityJitter: number;
  tipSpacingAuto: boolean;
  /** MoArt ribbon / advanced */
  ribbon: boolean;
  ribbonCycle: number;
  alternateSides: boolean;
  verticalThickness: boolean;
  tipFoilComposite: boolean;
  highSpeedTexture: boolean;
  /** 0–1 paper grain strength (user-settable texture amount). */
  textureStrength: number;
  shapeVariation: number;
  groundColorMix: boolean;
  paintAmount: number;
  pigmentPressure: boolean;
  pigmentConcentration: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
  /** Photoshop panel settings (when set, engine prefers these). */
  ps?: PsBrushSettings;
}

export const DEFAULT_BRUSH_TUNING: BrushTuning = {
  stabilizer: 2,
  // Strong size pressure (light→thin, hard→full); opacity pressure stays off for solid ink
  sizePressure: 0.95,
  opacityPressureStrength: 0,
  taperIn: 0,
  taperOut: 0,
  minSizeRatio: 0.08,
  density: 1,
  tipSpacing: 0.15,
  scatter: 0,
  hardness: 0.9,
  tipAngle: 0,
  speedTaper: false,
  directionMode: 'none',
  watercolorEdge: false,
  edgeThickness: 9,
  edgeStrength: 22,
  flow: 1,
  thickness: 1,
  binarize: false,
  edgeDarkness: 0,
  edgeBlur: 0,
  sizeJitter: 0,
  angleJitter: 0,
  densityJitter: 0,
  tipSpacingAuto: false,
  ribbon: false,
  ribbonCycle: 1,
  alternateSides: false,
  verticalThickness: false,
  tipFoilComposite: false,
  highSpeedTexture: false,
  textureStrength: 0,
  shapeVariation: 0,
  groundColorMix: false,
  paintAmount: 0.5,
  pigmentPressure: false,
  pigmentConcentration: 0.5,
  blendMode: 'normal',
};

export const BRUSH_TEXTURE_OPTIONS: BrushTexture[] = [
  'hard',
  'soft',
  'pencil',
  'marker',
  'airbrush',
  'calligraphy',
  'normal',
];

interface DrawingToolsProps {
  shotId: string;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onBrushSizeChange: (size: number) => void;
  onOpacityChange?: (opacity: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClear?: () => void;
  onResetView?: () => void;
  onFitToScreen?: () => void;
  onClearSelection?: () => void;
  currentTool: DrawingTool;
  currentColor: string;
  currentBrushSize: number;
  currentOpacity?: number;
  enablePressure?: boolean;
  onPressureToggle?: (enabled: boolean) => void;
  enableOpacityPressure?: boolean;
  onOpacityPressureToggle?: (enabled: boolean) => void;
  smoothness?: number;
  onSmoothnessChange?: (smoothness: number) => void;
  brushTexture?: BrushTexture;
  onBrushTextureChange?: (texture: BrushTexture) => void;
  brushPresetId?: string;
  onBrushPresetChange?: (presetId: string) => void;
  brushTuning?: BrushTuning;
  onBrushTuningChange?: (tuning: Partial<BrushTuning>) => void;
  arrowStyle?: ArrowStyle;
  onArrowStyleChange?: (style: ArrowStyle) => void;
  layout?: 'inline' | 'rail' | 'floating';
  /** Which slice to render when layout is floating */
  floatingSection?: 'tools' | 'brush' | 'color' | 'options';
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  brushLibraryOpen?: boolean;
  onToggleBrushLibrary?: () => void;
}

const QUICK_COLORS = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FF9800', '#9C27B0'];
const BRUSH_SIZES = [1, 2, 3, 5, 8, 10, 15, 20];

const SIZE_TOOLS: DrawingTool[] = [
  'brush',
  'eraser',
  'arrow',
  'line',
  'rect',
  'ellipse',
  'camera',
  'text',
];
const OPACITY_TOOLS: DrawingTool[] = ['brush', 'arrow', 'line', 'rect', 'ellipse', 'camera', 'fill'];

export function DrawingTools({
  shotId: _shotId,
  onToolChange,
  onColorChange,
  onBrushSizeChange,
  onOpacityChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onClear,
  onResetView,
  onFitToScreen,
  onClearSelection,
  currentTool,
  currentColor,
  currentBrushSize,
  currentOpacity = 100,
  enablePressure = true,
  onPressureToggle,
  enableOpacityPressure = false,
  onOpacityPressureToggle,
  smoothness = 5,
  onSmoothnessChange,
  brushTexture = 'hard',
  onBrushTextureChange,
  brushPresetId = 'hard',
  onBrushPresetChange,
  brushTuning = DEFAULT_BRUSH_TUNING,
  onBrushTuningChange,
  arrowStyle = 'solid',
  onArrowStyleChange,
  layout = 'inline',
  floatingSection = 'tools',
  detailsOpen = false,
  onToggleDetails,
  brushLibraryOpen = false,
  onToggleBrushLibrary,
}: DrawingToolsProps) {
  const { t } = useTranslation();
  const [showColorWheel, setShowColorWheel] = useState(false);
  const colorButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColorWheel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorButtonRef.current && !colorButtonRef.current.contains(e.target as Node)) {
        setShowColorWheel(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showColorWheel]);

  const toolIcon: Record<DrawingTool, string> = {
    brush: 'brush',
    eraser: 'cleaning_services',
    arrow: 'arrow_right_alt',
    line: 'horizontal_rule',
    text: 'title',
    select: 'select',
    lasso: 'lasso',
    lassoFill: 'lasso',
    move: 'open_with',
    scale: 'aspect_ratio',
    fill: 'format_color_fill',
    rect: 'crop_square',
    ellipse: 'circle',
    camera: 'photo_camera',
    eyedropper: 'colorize',
  };

  const applyPreset = (presetId: string) => {
    const preset = BRUSH_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onBrushPresetChange?.(preset.id);
    onBrushTextureChange?.(preset.texture);
    onBrushSizeChange(preset.defaultSize);
    onOpacityChange?.(preset.defaultOpacity);
    onSmoothnessChange?.(preset.defaultSmoothness);
    onPressureToggle?.(preset.pressure);
    onOpacityPressureToggle?.(preset.opacityPressure > 0);
    // Full restore to preset — session tweaks / leftover PS panels must not stick
    onBrushTuningChange?.({
      ...DEFAULT_BRUSH_TUNING,
      stabilizer: preset.stabilizer,
      sizePressure: preset.sizePressure,
      opacityPressureStrength: preset.opacityPressure,
      taperIn: preset.taperIn,
      taperOut: preset.taperOut,
      minSizeRatio: preset.minSizeRatio,
      density: preset.density ?? DEFAULT_BRUSH_TUNING.density,
      tipSpacing: preset.tipSpacing ?? DEFAULT_BRUSH_TUNING.tipSpacing,
      tipSpacingAuto: false,
      scatter: preset.scatter ?? DEFAULT_BRUSH_TUNING.scatter,
      hardness: preset.hardness ?? DEFAULT_BRUSH_TUNING.hardness,
      tipAngle: preset.tipAngle ?? 0,
      watercolorEdge: preset.watercolorEdge ?? false,
      edgeThickness: preset.edgeThickness ?? 6,
      edgeStrength: preset.edgeStrength ?? 18,
      textureStrength:
        preset.texture === 'pencil' ? 0.4 : DEFAULT_BRUSH_TUNING.textureStrength,
      ps: undefined,
    });
    // Keep current tool (eraser can use the selected brush tip)
  };

  const sizeControls = SIZE_TOOLS.includes(currentTool) && (
    <label className="block text-xs">
      {t('drawing.size')} {currentBrushSize}
      <input
        type="range"
        min={1}
        max={80}
        value={currentBrushSize}
        onChange={(e) => onBrushSizeChange(Number(e.target.value))}
        className="w-full"
      />
      {(layout === 'inline' || layout === 'floating') && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {BRUSH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onBrushSizeChange(size)}
              className={`pixel-border-button px-1.5 py-0.5 text-xs ${
                currentBrushSize === size ? 'is-active' : ''
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </label>
  );

  const opacityControls = OPACITY_TOOLS.includes(currentTool) && onOpacityChange && (
    <label className="block text-xs">
      {t('drawing.opacity')} {currentOpacity}%
      <input
        type="range"
        min={0}
        max={100}
        value={currentOpacity}
        onChange={(e) => onOpacityChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );

  const brushTuneControls = (currentTool === 'brush' || layout === 'floating') && (
    <>
      {onPressureToggle && (
        <button type="button" className="pixel-border-button px-2 py-1 text-xs w-full" onClick={() => onPressureToggle(!enablePressure)}>
          {t('drawing.pressure')} {enablePressure ? t('drawing.on') : t('drawing.off')}
        </button>
      )}
      {onOpacityPressureToggle && (
        <button
          type="button"
          className="pixel-border-button px-2 py-1 text-xs w-full"
          onClick={() => onOpacityPressureToggle(!enableOpacityPressure)}
        >
          {t('drawing.opacityPressure')} {enableOpacityPressure ? t('drawing.on') : t('drawing.off')}
        </button>
      )}
      {onSmoothnessChange && (
        <label className="block text-xs">
          {t('drawing.smoothness')} {smoothness}
          <input
            type="range"
            min={1}
            max={10}
            value={smoothness}
            onChange={(e) => onSmoothnessChange(Number(e.target.value))}
            className="w-full"
          />
        </label>
      )}
      {onBrushTuningChange && (
        <>
          <label className="block text-xs">
            {t('drawing.stabilizer')} {brushTuning.stabilizer}
            <input
              type="range"
              min={0}
              max={10}
              value={brushTuning.stabilizer}
              onChange={(e) => onBrushTuningChange({ stabilizer: Number(e.target.value) })}
              className="w-full"
            />
          </label>
          <label className="block text-xs">
            {t('drawing.sizePressure')} {Math.round(brushTuning.sizePressure * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brushTuning.sizePressure * 100)}
              onChange={(e) => onBrushTuningChange({ sizePressure: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
          <label className="block text-xs">
            {t('drawing.opacityPressureStrength')} {Math.round(brushTuning.opacityPressureStrength * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brushTuning.opacityPressureStrength * 100)}
              onChange={(e) =>
                onBrushTuningChange({ opacityPressureStrength: Number(e.target.value) / 100 })
              }
              className="w-full"
            />
          </label>
          <label className="block text-xs">
            {t('drawing.taperIn')} {Math.round(brushTuning.taperIn * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brushTuning.taperIn * 100)}
              onChange={(e) => onBrushTuningChange({ taperIn: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
          <label className="block text-xs">
            {t('drawing.taperOut')} {Math.round(brushTuning.taperOut * 100)}%
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(brushTuning.taperOut * 100)}
              onChange={(e) => onBrushTuningChange({ taperOut: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
          <label className="block text-xs">
            {t('drawing.minSizeRatio')} {Math.round(brushTuning.minSizeRatio * 100)}%
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(brushTuning.minSizeRatio * 100)}
              onChange={(e) => onBrushTuningChange({ minSizeRatio: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </label>
        </>
      )}
    </>
  );

  const arrowStyleControls = currentTool === 'arrow' && onArrowStyleChange && (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold">{t('drawing.arrowStyle')}</span>
      {(['solid', 'outline', 'double'] as ArrowStyle[]).map((style) => (
        <button
          key={style}
          type="button"
          onClick={() => onArrowStyleChange(style)}
          className={`pixel-border-button px-2 py-1 text-xs text-left ${arrowStyle === style ? 'is-active' : ''}`}
        >
          {t(`drawing.arrowStyle.${style}` as 'drawing.arrowStyle.solid')}
        </button>
      ))}
    </div>
  );

  const brushLibraryGrid = (
    <div className="grid grid-cols-2 gap-1.5">
      {BRUSH_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => applyPreset(preset.id)}
          className={`pixel-border-button p-2 text-left ${
            brushPresetId === preset.id || brushTexture === preset.texture ? 'is-active' : ''
          }`}
          title={t(`drawing.brushPreset.${preset.labelKey}` as 'drawing.brushPreset.hard')}
        >
          <div
            className="h-6 mb-1 rounded-sm bg-gradient-to-r from-transparent via-current to-transparent opacity-80"
            style={{
              color: currentColor,
              filter: preset.texture === 'soft' || preset.texture === 'airbrush' ? 'blur(1px)' : undefined,
            }}
          />
          <span className="text-[10px] leading-tight block truncate">
            {t(`drawing.brushPreset.${preset.labelKey}` as 'drawing.brushPreset.hard')}
          </span>
        </button>
      ))}
    </div>
  );

  const toolButton = (id: DrawingTool, label: string, compact = false) => (
    <button
      key={id}
      type="button"
      onClick={() => onToolChange(id)}
      title={label}
      aria-label={label}
      className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'} ${
        currentTool === id ? 'is-active' : ''
      }`}
    >
      {compact ? <UiIcon name={toolIcon[id]} /> : label}
    </button>
  );

  const commandButtons = (compact: boolean) => (
    <>
      {onUndo && (
        <button
          type="button"
          className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'} ${canUndo ? '' : 'opacity-40'}`}
          onClick={onUndo}
          disabled={!canUndo}
          title={t('drawing.undoTitle')}
        >
          {compact ? <UiIcon name="undo" /> : t('drawing.undo')}
        </button>
      )}
      {onRedo && (
        <button
          type="button"
          className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'} ${canRedo ? '' : 'opacity-40'}`}
          onClick={onRedo}
          disabled={!canRedo}
          title={t('drawing.redoTitle')}
        >
          {compact ? <UiIcon name="redo" /> : t('drawing.redo')}
        </button>
      )}
      {onFitToScreen && (
        <button
          type="button"
          className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'}`}
          onClick={onFitToScreen}
          title={t('drawing.fitToScreen')}
        >
          {compact ? <UiIcon name="fit_screen" /> : t('drawing.fitToScreen')}
        </button>
      )}
      {onResetView && (
        <button
          type="button"
          className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'}`}
          onClick={onResetView}
          title={t('drawing.resetView')}
        >
          {compact ? <UiIcon name="restart_alt" /> : t('drawing.resetView')}
        </button>
      )}
      {onClear && (
        <button
          type="button"
          className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'}`}
          title={t('drawing.clearTitle')}
          onClick={() => {
            if (window.confirm(t('drawing.clearConfirm'))) onClear();
          }}
        >
          {compact ? <UiIcon name="delete" /> : t('drawing.clear')}
        </button>
      )}
      {onClearSelection && (
        <button
          type="button"
          className={`pixel-border-button ${compact ? 'tablet-icon-btn' : 'px-2 py-1 text-xs'}`}
          onClick={onClearSelection}
          title={t('drawing.deselect')}
        >
          {compact ? <UiIcon name="close" /> : t('drawing.deselect')}
        </button>
      )}
    </>
  );

  const toolStrip = (compact: boolean) => (
    <>
      {toolButton('brush', t('drawing.brush'), compact)}
      {toolButton('eraser', t('drawing.eraser'), compact)}
      {toolButton('fill', t('drawing.fill'), compact)}
      {toolButton('eyedropper', t('drawing.eyedropper'), compact)}
      {toolButton('line', t('drawing.line'), compact)}
      {toolButton('rect', t('drawing.rect'), compact)}
      {toolButton('ellipse', t('drawing.ellipse'), compact)}
      {toolButton('camera', t('drawing.cameraMark'), compact)}
      {toolButton('arrow', t('drawing.arrow'), compact)}
      {toolButton('text', t('drawing.text'), compact)}
      {toolButton('select', t('drawing.select'), compact)}
      {toolButton('lasso', t('drawing.lasso'), compact)}
      {toolButton('lassoFill', t('drawing.lassoFill'), compact)}
      {toolButton('move', t('drawing.move'), compact)}
      {toolButton('scale', t('drawing.scale'), compact)}
    </>
  );

  if (layout === 'floating') {
    if (floatingSection === 'brush') {
      return (
        <div className="p-2 space-y-2 text-sm theme-text w-56">
          <p className="font-bold text-xs uppercase">{t('drawing.brushLibrary')}</p>
          {brushLibraryGrid}
          <div className="space-y-2 border-t theme-divider pt-2">
            {sizeControls}
            {opacityControls}
            {brushTuneControls}
          </div>
        </div>
      );
    }
    if (floatingSection === 'color') {
      return (
        <div className="p-2 space-y-2 theme-text w-48" ref={colorButtonRef}>
          <div className="flex flex-wrap gap-1">
            {QUICK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                className={`w-7 h-7 border-2 ${currentColor === c ? 'border-black dark:border-white' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            className={`pixel-border-button px-2 py-1 text-xs w-full ${showColorWheel ? 'is-active' : ''}`}
            onClick={() => setShowColorWheel((o) => !o)}
          >
            {t('drawing.colorWheel')}
          </button>
          {showColorWheel && (
            <ColorWheel currentColor={currentColor} onColorChange={onColorChange} onClose={() => setShowColorWheel(false)} />
          )}
          <div
            className="h-8 w-full border-2 border-black dark:border-white"
            style={{ backgroundColor: currentColor }}
            title={currentColor}
          />
        </div>
      );
    }
    if (floatingSection === 'options') {
      return (
        <div className="p-2 space-y-2 text-sm theme-text w-48">
          {sizeControls}
          {opacityControls}
          {arrowStyleControls}
          {currentTool === 'brush' && brushTuneControls}
          {onClearSelection && (
            <button type="button" className="pixel-border-button px-2 py-1 text-xs w-full" onClick={onClearSelection}>
              {t('drawing.deselect')}
            </button>
          )}
        </div>
      );
    }
    // tools strip
    return (
      <div className="flex flex-col items-center gap-1 p-1.5">
        {toolStrip(true)}
        <div className="w-full border-t theme-divider my-1" />
        {commandButtons(true)}
      </div>
    );
  }

  if (layout === 'rail') {
    return (
      <div className="flex h-full max-h-full relative">
        <div className="flex flex-col items-center gap-1 p-1 w-12 overflow-y-auto">
          {toolStrip(true)}
          <div className="flex flex-col gap-1">
            {QUICK_COLORS.slice(0, 5).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                className={`w-7 h-7 border-2 ${currentColor === c ? 'border-black dark:border-white' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            type="button"
            className={`pixel-border-button tablet-icon-btn ${showColorWheel ? 'is-active' : ''}`}
            onClick={() => setShowColorWheel((o) => !o)}
            title={t('drawing.colorWheel')}
          >
            <UiIcon name="palette" />
          </button>
          {showColorWheel && (
            <div className="absolute left-14 top-2 z-[9999]">
              <ColorWheel currentColor={currentColor} onColorChange={onColorChange} onClose={() => setShowColorWheel(false)} />
            </div>
          )}
          {onToggleBrushLibrary && (
            <button
              type="button"
              className={`pixel-border-button tablet-icon-btn ${brushLibraryOpen ? 'is-active' : ''}`}
              onClick={onToggleBrushLibrary}
              title={t('drawing.brushLibrary')}
            >
              <UiIcon name="brush" />
            </button>
          )}
          {commandButtons(true)}
          {onToggleDetails && (
            <button
              type="button"
              className={`pixel-border-button tablet-icon-btn ${detailsOpen ? 'is-active' : ''}`}
              onClick={onToggleDetails}
              title={t('library.moreTools')}
            >
              <UiIcon name="tune" />
            </button>
          )}
        </div>
        {brushLibraryOpen && (
          <div className="w-56 overflow-y-auto p-2 space-y-2 border-l theme-divider theme-text text-sm bg-white/95 dark:bg-gray-900/95">
            <p className="font-bold text-xs uppercase">{t('drawing.brushLibrary')}</p>
            {brushLibraryGrid}
            <div className="space-y-2 border-t theme-divider pt-2">
              {sizeControls}
              {opacityControls}
              {brushTuneControls}
            </div>
          </div>
        )}
        {detailsOpen && !brushLibraryOpen && (
          <div className="w-52 overflow-y-auto p-2 space-y-3 border-l theme-divider theme-text text-sm">
            <p className="font-bold">{t('library.moreTools')}</p>
            {sizeControls}
            {opacityControls}
            {brushTuneControls}
            {arrowStyleControls}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold uppercase">{t('drawing.tools')}</span>
        {toolStrip(false)}
        {onToggleBrushLibrary && (
          <button
            type="button"
            onClick={onToggleBrushLibrary}
            className={`pixel-border-button px-2 py-1 text-xs ${brushLibraryOpen ? 'is-active' : ''}`}
          >
            {t('drawing.brushLibrary')}
          </button>
        )}
      </div>

      {brushLibraryOpen && (
        <div className="flex gap-3 p-2 border theme-divider">
          <div className="w-56">{brushLibraryGrid}</div>
          <div className="flex-1 space-y-2 min-w-[12rem]">
            {sizeControls}
            {opacityControls}
            {brushTuneControls}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 relative" ref={colorButtonRef}>
          <span className="text-sm font-bold uppercase">{t('drawing.color')}</span>
          <div className="flex gap-1 items-center">
            {QUICK_COLORS.slice(0, 5).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                className={`w-6 h-6 border-2 ${currentColor === c ? 'border-black dark:border-white scale-110' : 'border-gray-300'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowColorWheel(!showColorWheel)}
              className={`pixel-border-button px-1.5 py-0.5 text-xs ${showColorWheel ? 'is-active' : ''}`}
              title={t('drawing.colorWheel')}
            >
              <UiIcon name="palette" />
            </button>
          </div>
          {showColorWheel && (
            <div className="absolute top-full left-0 mt-2 z-[9999]">
              <ColorWheel currentColor={currentColor} onColorChange={onColorChange} onClose={() => setShowColorWheel(false)} />
            </div>
          )}
        </div>

        {!brushLibraryOpen && sizeControls && <div className="min-w-[10rem]">{sizeControls}</div>}
        {!brushLibraryOpen && opacityControls && <div className="min-w-[8rem]">{opacityControls}</div>}
        {!brushLibraryOpen && arrowStyleControls}

        <div className="flex items-center gap-2 ml-auto">{commandButtons(false)}</div>
      </div>
    </div>
  );
}
