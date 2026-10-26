import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { ShotCard } from './ShotCard';
import { useTranslation } from '../../../i18n/useTranslation';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

const EMPTY_SHOTS: any[] = [];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const shotsRaw = useProjectStore(useShallow((state) => state.project?.shots || EMPTY_SHOTS));
  const shots = useMemo(() => {
    const shotsArray = Array.isArray(shotsRaw) ? shotsRaw : [];
    return [...shotsArray].sort((a, b) => a.order - b.order);
  }, [shotsRaw]);
  const createShot = useProjectStore((state) => state.createShot);
  const activeShotId = useUIStore((state) => state.activeShotId);
  const setActiveShot = useUIStore((state) => state.setActiveShot);

  const handleCreateShot = () => {
    const newShotId = createShot();
    if (!newShotId) {
      alert(t('sidebar.createShotFailed'));
      return;
    }
    setActiveShot(newShotId);
  };

  return (
    <aside className="w-72 flex flex-col gap-2 shrink-0 p-2">
      <div className="retro-window flex-1 flex flex-col overflow-hidden">
        <div className="retro-header">
          <span>SHOT_LIST</span>
          {onClose ? (
            <button type="button" onClick={onClose} className="leading-none px-1" aria-label="close">
              ×
            </button>
          ) : (
            <span>×</span>
          )}
        </div>
        <div className="p-2 border-b-2 border-black dark:border-white">
          <button
            type="button"
            onClick={handleCreateShot}
            className="pixel-border-button w-full px-3 py-2 text-sm flex items-center gap-2 justify-center"
          >
            <span aria-hidden>+</span>
            <span className="truncate">{t('sidebar.newShot')}</span>
          </button>
        </div>
      
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {shots.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8 leading-relaxed">
              {t('sidebar.noShots')}，{t('sidebar.noShots.hint')}
            </div>
          ) : (
            shots.map((shot) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                isActive={shot.id === activeShotId}
                onClick={() => setActiveShot(shot.id)}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}



