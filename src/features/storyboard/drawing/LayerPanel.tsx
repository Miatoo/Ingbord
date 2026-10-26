import { useMemo, useState } from 'react';
import type { DrawingLayer, LayerBlendMode } from '../../../types';
import { useTranslation } from '../../../i18n/useTranslation';
import { UiIcon } from '../components/UiIcon';

const BLEND_MODES: LayerBlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

interface LayerPanelProps {
  layers: DrawingLayer[];
  activeLayerId: string;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onBlendModeChange: (id: string, mode: LayerBlendMode) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  className?: string;
}

export function LayerPanel({
  layers,
  activeLayerId,
  onSelect,
  onToggleVisible,
  onAdd,
  onDelete,
  onReorder,
  onOpacityChange,
  onBlendModeChange,
  collapsed = false,
  onToggleCollapsed,
  className = '',
}: LayerPanelProps) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)),
    [layers]
  );

  const active = layers.find((l) => l.id === activeLayerId);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ids = sorted.map((l) => l.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) {
      setDragId(null);
      return;
    }
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    // ids are top-to-bottom; convert to bottom-to-top order values
    onReorder([...ids].reverse());
    setDragId(null);
  };

  if (collapsed) {
    return (
      <button
        type="button"
        className={`pixel-border-button px-2 py-1 text-xs ${className}`}
        onClick={onToggleCollapsed}
        title={t('drawing.layers')}
      >
        <UiIcon name="layers" /> {t('drawing.layers')}
      </button>
    );
  }

  return (
    <div className={`flex flex-col theme-text text-xs min-w-[11rem] max-w-[16rem] ${className}`}>
      <div className="flex items-center justify-between gap-1 px-1 py-1 border-b theme-divider">
        <span className="font-bold uppercase">{t('drawing.layers')}</span>
        <div className="flex gap-0.5">
          <button type="button" className="pixel-border-button px-1.5 py-0.5" title={t('drawing.layerAdd')} onClick={onAdd}>
            +
          </button>
          <button
            type="button"
            className="pixel-border-button px-1.5 py-0.5"
            title={t('drawing.layerDelete')}
            onClick={() => activeLayerId && onDelete(activeLayerId)}
          >
            −
          </button>
          {onToggleCollapsed && (
            <button type="button" className="pixel-border-button px-1.5 py-0.5" onClick={onToggleCollapsed}>
              <UiIcon name="chevron_down" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-48 space-y-0.5 p-1">
        {sorted.map((layer) => (
          <div
            key={layer.id}
            draggable={layer.role !== 'background'}
            onDragStart={() => setDragId(layer.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(layer.id)}
            className={`flex items-center gap-1 px-1 py-1 border cursor-pointer ${
              layer.id === activeLayerId
                ? 'border-black dark:border-white bg-black/10 dark:bg-white/10'
                : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            onClick={() => onSelect(layer.id)}
          >
            <button
              type="button"
              className="shrink-0 w-5 text-center"
              title={layer.visible ? t('drawing.layerHide') : t('drawing.layerShow')}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisible(layer.id);
              }}
            >
              {layer.visible ? '●' : '○'}
            </button>
            {layer.image ? (
              <img src={layer.image} alt="" className="w-8 h-8 object-cover bg-white border border-gray-300 shrink-0" />
            ) : (
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 shrink-0" />
            )}
            <span className="truncate flex-1">
              {layer.role === 'background' ? t('drawing.background') : layer.name}
            </span>
          </div>
        ))}
      </div>

      {active && (
        <div className="border-t theme-divider p-2 space-y-2">
          <label className="block">
            {t('drawing.layerOpacity')} {active.opacity ?? 100}%
            <input
              type="range"
              min={0}
              max={100}
              value={active.opacity ?? 100}
              className="w-full"
              onChange={(e) => onOpacityChange(active.id, Number(e.target.value))}
            />
          </label>
          <label className="block">
            {t('drawing.blendMode')}
            <select
              className="w-full mt-0.5 border border-black dark:border-white bg-white dark:bg-gray-800 px-1 py-0.5"
              value={active.blendMode || 'normal'}
              onChange={(e) => onBlendModeChange(active.id, e.target.value as LayerBlendMode)}
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`drawing.blend.${mode}` as 'drawing.blend.normal')}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
