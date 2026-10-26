import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { BoardGrid } from '../components/BoardGrid';
import { useTranslation } from '../../../i18n/useTranslation';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

const EMPTY_SHOTS: any[] = [];

export function BoardView() {
  const { t } = useTranslation();
  const shotsRaw = useProjectStore(useShallow((state) => state.project?.shots || EMPTY_SHOTS));
  const shots = useMemo(() => {
    const shotsArray = Array.isArray(shotsRaw) ? shotsRaw : [];
    return [...shotsArray].sort((a, b) => a.order - b.order);
  }, [shotsRaw]);
  const activeShotId = useUIStore((state) => state.activeShotId);
  const setActiveShot = useUIStore((state) => state.setActiveShot);
  const setViewMode = useUIStore((state) => state.setViewMode);

  const handleShotClick = (shotId: string) => {
    setActiveShot(shotId);
  };

  const handleShotDoubleClick = (shotId: string) => {
    setActiveShot(shotId);
    // 双击可以进入编辑模式，这里先进入标注视图
    setViewMode('annotation');
  };

  return (
    <div className="retro-window flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="retro-header">
        <span>STORYBOARD_CANVAS</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {shots.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-gray-600 text-lg mb-2">{t('sidebar.noShots')}</div>
              <div className="text-gray-600 text-sm leading-relaxed">
                {t('sidebar.noShots.hint')}
              </div>
            </div>
          </div>
        ) : (
          <BoardGrid
            shots={shots}
            activeShotId={activeShotId}
            onShotClick={handleShotClick}
            onShotDoubleClick={handleShotDoubleClick}
          />
        )}
      </div>
    </div>
  );
}

