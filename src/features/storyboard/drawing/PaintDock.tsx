import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ColorWheel } from './ColorWheel';
import { useTranslation } from '../../../i18n/useTranslation';
import { UiIcon } from '../components/UiIcon';
import type { ArrowStyle } from './brushPresets';
import type { BrushTexture, BrushTuning, DrawingTool } from './DrawingTools';
import type { FillEdgeMode } from '../../../utils/drawingLayers';

export type { DrawingTool, BrushTexture, BrushTuning };
export { BrushDetailPanel } from './BrushDetailPanel';

const TOOL_GRID: { id: DrawingTool; icon: string; labelKey: string }[] = [
  { id: 'brush', icon: 'tool_pen', labelKey: 'drawing.brush' },
  { id: 'eraser', icon: 'tool_eraser', labelKey: 'drawing.eraser' },
  { id: 'lasso', icon: 'tool_lasso', labelKey: 'drawing.lasso' },
  { id: 'fill', icon: 'tool_fill', labelKey: 'drawing.fill' },
  { id: 'text', icon: 'tool_text', labelKey: 'drawing.text' },
  { id: 'line', icon: 'tool_line', labelKey: 'drawing.line' },
  { id: 'arrow', icon: 'tool_arrow', labelKey: 'drawing.arrow' },
  { id: 'rect', icon: 'tool_rect', labelKey: 'drawing.rect' },
  { id: 'ellipse', icon: 'tool_ellipse', labelKey: 'drawing.ellipse' },
  { id: 'lassoFill', icon: 'tool_lasso_fill', labelKey: 'drawing.lassoFill' },
  { id: 'select', icon: 'tool_select', labelKey: 'drawing.select' },
  { id: 'move', icon: 'tool_move', labelKey: 'drawing.move' },
  { id: 'scale', icon: 'tool_transform', labelKey: 'drawing.scale' },
  { id: 'camera', icon: 'tool_camera', labelKey: 'drawing.cameraMark' },
];

export interface PaintDockProps {
  currentTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  foregroundColor: string;
  backgroundColor: string;
  activeColorSlot: 'fg' | 'bg';
  onActiveColorSlotChange: (slot: 'fg' | 'bg') => void;
  onSwapColors: () => void;
  onResetColors?: () => void;
  currentBrushSize: number;
  onBrushSizeChange: (size: number) => void;
  currentOpacity: number;
  onOpacityChange: (opacity: number) => void;
  enablePressure: boolean;
  onPressureToggle: (v: boolean) => void;
  enableOpacityPressure: boolean;
  onOpacityPressureToggle: (v: boolean) => void;
  brushPresetId: string;
  onBrushPresetChange: (id: string) => void;
  brushTexture: BrushTexture;
  onBrushTextureChange: (t: BrushTexture) => void;
  brushTuning: BrushTuning;
  onBrushTuningChange: (partial: Partial<BrushTuning>) => void;
  arrowStyle: ArrowStyle;
  onArrowStyleChange: (s: ArrowStyle) => void;
  fillEdgeMode: FillEdgeMode;
  onFillEdgeModeChange: (m: FillEdgeMode) => void;
  fillEdgeWidth: number;
  onFillEdgeWidthChange: (w: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onFitToScreen?: () => void;
  onClearSelection?: () => void;
  onOpenDetail?: () => void;
  detailOpen?: boolean;
  onOpenLibrary?: () => void;
  libraryOpen?: boolean;
  activeBrushLabel?: string;
}

function BrushStrokePreview({
  color,
  size,
  opacity,
  texture,
  taperIn,
  taperOut,
}: {
  color: string;
  size: number;
  opacity: number;
  texture: BrushTexture;
  taperIn: number;
  taperOut: number;
}) {
  const path = useMemo(() => {
    const w = 200;
    const h = 44;
    const mid = h / 2;
    const pts: string[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = 10 + t * (w - 20);
      const y = mid + Math.sin(t * Math.PI * 1.2) * 6;
      pts.push(`${x},${y}`);
    }
    const sw = Math.max(2, Math.min(28, size * (texture === 'airbrush' ? 1.4 : 1)));
    return { pts: pts.join(' '), sw, blur: texture === 'airbrush' || texture === 'soft' ? 2.5 : 0 };
  }, [size, texture, taperIn, taperOut]);

  return (
    <div className="paint-preview relative rounded h-11 overflow-hidden">
      <svg width="100%" height="44" viewBox="0 0 200 44" preserveAspectRatio="none">
        <polyline
          points={path.pts}
          fill="none"
          stroke={color}
          strokeOpacity={opacity / 100}
          strokeWidth={path.sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: path.blur ? `blur(${path.blur}px)` : undefined }}
        />
      </svg>
      <span className="absolute right-1.5 bottom-0.5 text-[10px] theme-muted font-medium">{size}px</span>
    </div>
  );
}

export function PaintDock({
  currentTool,
  onToolChange,
  currentColor,
  onColorChange,
  foregroundColor,
  backgroundColor,
  activeColorSlot,
  onActiveColorSlotChange,
  onSwapColors,
  onResetColors,
  currentBrushSize,
  onBrushSizeChange,
  currentOpacity,
  onOpacityChange,
  enablePressure,
  onPressureToggle,
  enableOpacityPressure,
  onOpacityPressureToggle,
  brushTexture,
  brushTuning,
  onBrushTuningChange,
  arrowStyle,
  onArrowStyleChange,
  fillEdgeMode,
  onFillEdgeModeChange,
  fillEdgeWidth,
  onFillEdgeWidthChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFitToScreen,
  onClearSelection,
  onOpenDetail,
  detailOpen,
  onOpenLibrary,
  libraryOpen,
  activeBrushLabel,
}: PaintDockProps) {
  const { t } = useTranslation();
  const [hex, setHex] = useState(currentColor);
  useEffect(() => {
    setHex(currentColor);
  }, [currentColor]);

  const row = (label: string, control: ReactNode, trailing?: ReactNode) => (
    <div className="flex items-center gap-2 text-[11px] py-0.5 theme-text">
      <span className="w-[4.5rem] shrink-0 theme-muted truncate">{label}</span>
      <div className="flex-1 min-w-0">{control}</div>
      {trailing}
    </div>
  );

  const toolBtn = (active: boolean) =>
    `h-7 rounded flex items-center justify-center pixel-border-button ${active ? 'is-active' : ''}`;

  const isBrushTool = currentTool === 'brush' || currentTool === 'eraser';
  const isStrokeTool =
    currentTool === 'line' ||
    currentTool === 'arrow' ||
    currentTool === 'rect' ||
    currentTool === 'ellipse' ||
    currentTool === 'camera';
  const isFillTool = currentTool === 'fill' || currentTool === 'lassoFill';
  const isTextTool = currentTool === 'text';

  const sizeRow = row(
    isTextTool ? t('drawing.textTool.size') : t('drawing.size'),
    <input
      type="range"
      min={1}
      max={isTextTool ? 120 : 80}
      value={currentBrushSize}
      onChange={(e) => onBrushSizeChange(Number(e.target.value))}
      className="w-full paint-range"
    />,
    isBrushTool ? (
      <button
        type="button"
        title={t('drawing.pressure')}
        className={`w-6 h-6 rounded text-[10px] pixel-border-button ${enablePressure ? 'is-active' : ''}`}
        onClick={() => onPressureToggle(!enablePressure)}
      >
        P
      </button>
    ) : (
      <span className="w-6 text-center text-[10px] theme-muted">{currentBrushSize}</span>
    )
  );

  const opacityRow = row(
    t('drawing.opacity'),
    <input
      type="range"
      min={0}
      max={100}
      value={currentOpacity}
      onChange={(e) => onOpacityChange(Number(e.target.value))}
      className="w-full paint-range"
    />,
    isBrushTool ? (
      <button
        type="button"
        title={t('drawing.opacityPressure')}
        className={`w-6 h-6 rounded text-[10px] pixel-border-button ${
          enableOpacityPressure ? 'is-active' : ''
        }`}
        onClick={() => onOpacityPressureToggle(!enableOpacityPressure)}
      >
        A
      </button>
    ) : (
      <span className="w-6 text-center text-[10px] theme-muted">{currentOpacity}</span>
    )
  );

  return (
    <div className="paint-dock w-[252px] p-2 space-y-2 select-none theme-text">
      <div className="flex justify-center">
        <ColorWheel
          currentColor={currentColor}
          onColorChange={(c) => {
            onColorChange(c);
            setHex(c);
          }}
          compact
        />
      </div>
      <div className="flex items-center gap-2">
        {/* Photoshop-style FG / BG swatches */}
        <div className="relative w-11 h-11 shrink-0" title={t('drawing.foreground') + ' / ' + t('drawing.background')}>
          <button
            type="button"
            title={t('drawing.background')}
            aria-label={t('drawing.background')}
            className={`absolute right-0 bottom-0 w-7 h-7 rounded-sm border shadow-sm ${
              activeColorSlot === 'bg' ? 'ring-2 ring-[var(--ui-accent)] z-[1]' : 'z-0'
            }`}
            style={{
              backgroundColor: backgroundColor,
              borderColor: 'var(--ui-input-border)',
            }}
            onClick={() => onActiveColorSlotChange('bg')}
          />
          <button
            type="button"
            title={t('drawing.foreground')}
            aria-label={t('drawing.foreground')}
            className={`absolute left-0 top-0 w-7 h-7 rounded-sm border shadow-sm ${
              activeColorSlot === 'fg' ? 'ring-2 ring-[var(--ui-accent)] z-[2]' : 'z-[1]'
            }`}
            style={{
              backgroundColor: foregroundColor,
              borderColor: 'var(--ui-input-border)',
            }}
            onClick={() => onActiveColorSlotChange('fg')}
          />
          <button
            type="button"
            title={t('drawing.swapColors')}
            className="absolute -right-0.5 -top-0.5 w-4 h-4 rounded text-[9px] leading-none pixel-border-button z-[3] flex items-center justify-center"
            onClick={onSwapColors}
          >
            ⇄
          </button>
          {onResetColors && (
            <button
              type="button"
              title={t('drawing.resetColors')}
              className="absolute -left-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-sm border border-black bg-white z-[3]"
              onClick={onResetColors}
            />
          )}
        </div>
        <input
          className="theme-input flex-1 h-7 px-2 text-[11px] font-mono"
          value={hex}
          onChange={(e) => {
            const v = e.target.value;
            setHex(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onColorChange(v);
          }}
          onFocus={() => setHex(currentColor)}
        />
        <button
          type="button"
          title={t('drawing.eyedropper')}
          className={`w-7 h-7 rounded flex items-center justify-center pixel-border-button ${
            currentTool === 'eyedropper' ? 'is-active' : ''
          }`}
          onClick={() => onToolChange('eyedropper')}
        >
          <UiIcon name="tool_eyedropper" />
        </button>
      </div>

      <div>
        <div className="text-[10px] theme-muted mb-1">{t('drawing.tools')}</div>
        <div className="grid grid-cols-7 gap-1">
          {TOOL_GRID.map((tool) => (
            <button
              key={tool.id}
              type="button"
              title={t(tool.labelKey as 'drawing.brush')}
              onClick={() => onToolChange(tool.id)}
              className={toolBtn(currentTool === tool.id)}
            >
              <UiIcon name={tool.icon} />
            </button>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {onUndo && (
            <button
              type="button"
              className={`flex-1 h-6 rounded text-[10px] pixel-border-button ${!canUndo ? 'opacity-40' : ''}`}
              disabled={!canUndo}
              onClick={onUndo}
            >
              {t('drawing.undo')}
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              className={`flex-1 h-6 rounded text-[10px] pixel-border-button ${!canRedo ? 'opacity-40' : ''}`}
              disabled={!canRedo}
              onClick={onRedo}
            >
              {t('drawing.redo')}
            </button>
          )}
          {onFitToScreen && (
            <button type="button" className="flex-1 h-6 rounded text-[10px] pixel-border-button" onClick={onFitToScreen}>
              {t('drawing.fitToScreen')}
            </button>
          )}
          {onClearSelection && (
            <button
              type="button"
              className="flex-1 h-6 rounded text-[10px] pixel-border-button"
              onClick={onClearSelection}
            >
              {t('drawing.deselect')}
            </button>
          )}
        </div>
      </div>

      {/* Tool-specific options — brush chrome only for brush / eraser */}
      {isBrushTool && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] theme-muted">{t('drawing.brush')}</div>
            {activeBrushLabel && (
              <span className="text-[9px] theme-muted truncate max-w-[8rem]">{activeBrushLabel}</span>
            )}
          </div>
          <BrushStrokePreview
            color={foregroundColor}
            size={currentBrushSize}
            opacity={currentOpacity}
            texture={brushTexture}
            taperIn={brushTuning.taperIn}
            taperOut={brushTuning.taperOut}
          />
          {onOpenLibrary && (
            <button
              type="button"
              className={`w-full mt-1.5 h-7 rounded text-[11px] pixel-border-button ${
                libraryOpen ? 'is-active' : ''
              }`}
              onClick={onOpenLibrary}
            >
              {t('drawing.brushLibrary')}
            </button>
          )}
          {sizeRow}
          {opacityRow}
          {row(
            t('drawing.stabilizer'),
            <input
              type="range"
              min={0}
              max={10}
              value={brushTuning.stabilizer}
              onChange={(e) => onBrushTuningChange({ stabilizer: Number(e.target.value) })}
              className="w-full paint-range"
            />,
            <span className="w-6 text-center text-[10px] theme-muted">{brushTuning.stabilizer}</span>
          )}
          {row(
            t('drawing.binarize'),
            <input
              type="checkbox"
              className="paint-check"
              checked={brushTuning.binarize}
              onChange={(e) => onBrushTuningChange({ binarize: e.target.checked })}
            />
          )}
          {row(
            t('drawing.blendMode'),
            <select
              className="theme-input w-full h-6 text-[10px]"
              value={brushTuning.blendMode}
              onChange={(e) =>
                onBrushTuningChange({
                  blendMode: e.target.value as BrushTuning['blendMode'],
                })
              }
            >
              {(['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`drawing.blend.${m}` as 'drawing.blend.normal')}
                </option>
              ))}
            </select>
          )}
          {onOpenDetail && (
            <button
              type="button"
              className={`w-full mt-1.5 h-7 rounded text-[11px] pixel-border-button ${
                detailOpen ? 'is-active' : ''
              }`}
              onClick={onOpenDetail}
            >
              {t('drawing.brushDetail')}
            </button>
          )}
        </div>
      )}

      {isStrokeTool && (
        <div>
          <div className="text-[10px] theme-muted mb-1">
            {t(
              (
                currentTool === 'line'
                  ? 'drawing.line'
                  : currentTool === 'arrow'
                    ? 'drawing.arrow'
                    : currentTool === 'rect'
                      ? 'drawing.rect'
                      : currentTool === 'ellipse'
                        ? 'drawing.ellipse'
                        : 'drawing.cameraMark'
              ) as 'drawing.line'
            )}
          </div>
          {sizeRow}
          {opacityRow}
          {currentTool === 'arrow' && (
            <div className="flex gap-1 mt-1">
              {(['solid', 'outline', 'double'] as ArrowStyle[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`flex-1 h-6 rounded text-[9px] pixel-border-button ${
                    arrowStyle === s ? 'is-active' : ''
                  }`}
                  onClick={() => onArrowStyleChange(s)}
                >
                  {t(`drawing.arrowStyle.${s}` as 'drawing.arrowStyle.solid')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isFillTool && (
        <div className="space-y-1">
          <div className="text-[10px] theme-muted">
            {t(currentTool === 'lassoFill' ? 'drawing.lassoFill' : 'drawing.fill')}
          </div>
          {row(
            t('drawing.opacity'),
            <input
              type="range"
              min={0}
              max={100}
              value={currentOpacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-full paint-range"
            />,
            <span className="w-8 text-center text-[10px] theme-muted tabular-nums">
              {currentOpacity}%
            </span>
          )}
          <div className="text-[10px] theme-muted pt-1">{t('drawing.fillEdge')}</div>
          <div className="flex flex-col gap-0.5">
            {(
              [
                ['match', 'drawing.fillEdge.match'],
                ['background', 'drawing.fillEdge.background'],
              ] as const
            ).map(([mode, key]) => (
              <button
                key={mode}
                type="button"
                className={`w-full h-6 rounded text-[9px] pixel-border-button text-left px-2 ${
                  fillEdgeMode === mode ? 'is-active' : ''
                }`}
                onClick={() => onFillEdgeModeChange(mode)}
              >
                {t(key)}
              </button>
            ))}
          </div>
          {fillEdgeMode === 'background' && (
            <div className="pt-1 space-y-0.5">
              <div className="flex items-center justify-between text-[10px] theme-muted">
                <span>{t('drawing.fillEdgeWidth')}</span>
                <span>{fillEdgeWidth}px</span>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={fillEdgeWidth}
                onChange={(e) => onFillEdgeWidthChange(Number(e.target.value))}
                className="w-full paint-range"
              />
              <p className="text-[9px] theme-muted leading-snug">{t('drawing.fillEdgeWidthHint')}</p>
            </div>
          )}
        </div>
      )}

      {isTextTool && (
        <div>
          <div className="text-[10px] theme-muted mb-1">{t('drawing.text')}</div>
          {sizeRow}
          {opacityRow}
        </div>
      )}
    </div>
  );
}

