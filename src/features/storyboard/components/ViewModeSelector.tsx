import { useUIStore } from '../../../store/uiStore';
import { ViewMode } from '../../../types';
import { useTranslation } from '../../../i18n/useTranslation';
import { UiIcon } from './UiIcon';

const VIEW_ICONS: Record<ViewMode, string> = {
  board: 'grid_view',
  pose3d: 'view_in_ar',
  annotation: 'brush',
  aigenerate: 'auto_awesome',
};

export function ViewModeSelector({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const viewMode = useUIStore((state) => state.viewMode);
  const setViewMode = useUIStore((state) => state.setViewMode);

  const viewModeLabelKey: Record<ViewMode, 'view.board' | 'view.pose3d' | 'view.annotation' | 'view.aiImage'> = {
    board: 'view.board',
    pose3d: 'view.pose3d',
    annotation: 'view.annotation',
    aigenerate: 'view.aiImage',
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {(Object.keys(viewModeLabelKey) as ViewMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            title={t(viewModeLabelKey[mode])}
            aria-label={t(viewModeLabelKey[mode])}
            className={`pixel-border-button tablet-icon-btn ${viewMode === mode ? 'is-active' : ''}`}
          >
            <UiIcon name={VIEW_ICONS[mode]} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {(Object.keys(viewModeLabelKey) as ViewMode[]).map((mode) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`pixel-border-button px-4 py-1 text-sm ${
            viewMode === mode
              ? 'bg-black text-white dark:bg-white dark:text-black'
              : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
        >
          {t(viewModeLabelKey[mode])}
        </button>
      ))}
    </div>
  );
}
