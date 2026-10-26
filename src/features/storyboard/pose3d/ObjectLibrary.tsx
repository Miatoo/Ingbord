import { useState, useEffect } from 'react';
import { PoseEditorCanvasRef, SceneObject } from './PoseEditorCanvas';
import { useTranslation } from '../../../i18n/useTranslation';
import { getAssetPath } from '../../../utils/pathUtils';

interface ObjectLibraryProps {
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
  onOpenPropLibrary?: () => void;
}

interface ObjectDef {
  id: string;
  name: string;
  type?: string;
  height?: number;
}

export function ObjectLibrary({ canvasRef, onOpenPropLibrary }: ObjectLibraryProps) {
  const { t } = useTranslation();
  const [objects, setObjects] = useState<ObjectDef[]>([]);
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const loadObjects = async () => {
      try {
        setLoading(true);
        const response = await fetch(getAssetPath('/models/cameras/objects.json'));
        if (response.ok) {
          const data = await response.json();
          const arr = Object.keys(data).map((key) => ({
            id: key,
            name: data[key].name || key,
            type: data[key].type,
            height: data[key].height,
          }));
          arr.sort((a, b) => a.name.localeCompare(b.name));
          setObjects(arr);
        } else {
          setObjects([]);
        }
      } catch {
        setObjects([]);
      } finally {
        setLoading(false);
      }
    };
    loadObjects();
  }, []);

  useEffect(() => {
    const update = () => {
      if (canvasRef?.current) {
        setSceneObjects(canvasRef.current.getObjects());
        setSelectedObjectId(canvasRef.current.getSelectedObjectId());
      }
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [canvasRef]);

  const handleSelectObject = (id: string) => {
    canvasRef?.current?.selectObject(id);
    setSelectedObjectId(id);
  };

  const handleClearObjectSelection = () => {
    canvasRef?.current?.selectObject(null);
    setSelectedObjectId(null);
  };

  const handleRemoveObject = (id: string) => {
    if (confirm(t('pose3d.deleteObjectConfirm'))) {
      canvasRef?.current?.removeObject(id);
    }
  };

  return (
    <div className="border-t-2 border-black dark:border-white pt-3">
      <div className="flex items-center gap-1 mb-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between text-sm font-bold uppercase hover:bg-gray-100 dark:hover:bg-gray-800 px-1 py-1"
        >
          {loading
            ? t('pose3d.objectLibrary')
            : `${t('pose3d.objectLibrary')} (${objects.length})`}
          <span className="text-xs">{expanded ? '▼' : '▶'}</span>
        </button>
        <button
          type="button"
          className="pixel-border-button px-2 py-1 text-xs shrink-0"
          onClick={() => onOpenPropLibrary?.()}
        >
          {t('pose3d.openPropLibrary')}
        </button>
      </div>

      {expanded && (
        <>
          {loading ? (
            <div className="text-xs text-gray-500">{t('pose3d.loading')}</div>
          ) : (
            <p className="text-xs text-gray-400 mb-2">{t('pose3d.propLibraryHint')}</p>
          )}

          {sceneObjects.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase">
                  {t('pose3d.sceneObjectsCount').replace('{count}', String(sceneObjects.length))}
                </label>
                {selectedObjectId && (
                  <button
                    type="button"
                    onClick={handleClearObjectSelection}
                    className="pixel-border-button px-2 py-0.5 text-xs"
                  >
                    {t('pose3d.deselect')}
                  </button>
                )}
              </div>
              <div className="retro-window space-y-1 max-h-32 overflow-y-auto p-2">
                {sceneObjects.map((obj) => {
                  const isSelected = selectedObjectId === obj.id;
                  return (
                    <div
                      key={obj.id}
                      onClick={() => handleSelectObject(obj.id)}
                      className={`flex items-center justify-between p-2 text-xs cursor-pointer ${
                        isSelected ? 'ring-2 ring-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="truncate font-medium">{obj.name}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveObject(obj.id);
                        }}
                        className="pixel-border-button px-2 py-0.5 text-xs shrink-0"
                      >
                        {t('aiImage.upload.delete')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
