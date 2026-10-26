import { useUIStore } from '../../../store/uiStore';
import { useTabletLayout } from '../../../hooks/useTabletLayout';
import { BoardView } from '../views/BoardView';
import { Pose3DView } from '../views/Pose3DView';
import { AnnotationView } from '../views/AnnotationView';
import { AIImageView } from '../views/AIImageView';
import { ViewModeSelector } from './ViewModeSelector';

export function MainWorkspace() {
  const viewMode = useUIStore((state) => state.viewMode);
  const tablet = useTabletLayout();

  const renderView = () => {
    switch (viewMode) {
      case 'board':
        return <BoardView />;
      case 'pose3d':
        return <Pose3DView />;
      case 'annotation':
        return <AnnotationView />;
      case 'aigenerate':
        return <AIImageView />;
      default:
        return <BoardView />;
    }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden p-2 gap-2">
      {/* 平板把视图切换收进顶栏图标，这里不再占一行 */}
      {!tablet && (
        <div className="retro-window p-2 bg-white dark:bg-gray-800">
          <ViewModeSelector />
        </div>
      )}
      
      {/* 当前视图内容：min-h-0 使 3D 等视图高度随当前可视区域适配 */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {renderView()}
      </div>
    </div>
  );
}



