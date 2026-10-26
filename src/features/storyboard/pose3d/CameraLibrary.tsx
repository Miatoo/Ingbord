import { useState, useEffect } from 'react';
import { PoseEditorCanvasRef, SceneObject } from './PoseEditorCanvas';
import { useTranslation } from '../../../i18n/useTranslation';
import { getAssetPath } from '../../../utils/pathUtils';

interface CameraLibraryProps {
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
}

interface CameraDef {
  id: string;
  name: string;
  type?: string;
  /** 模型路径，相对 public/models/，如 "characters/virtual-camera.glb"；缺省时用 "cameras/{id}.glb" */
  model?: string;
}

interface CameraPositionPreset {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

export function CameraLibrary({ canvasRef }: CameraLibraryProps) {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState<CameraDef[]>([]);
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedToAdd, setSelectedToAdd] = useState<string>('');
  const [positionPresets, setPositionPresets] = useState<CameraPositionPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const loadCameras = async () => {
      try {
        setLoading(true);
        const response = await fetch(getAssetPath('/models/cameras/cameras.json'));
        if (response.ok) {
          const data = await response.json();
          const arr = Object.keys(data).map((key) => ({
            id: key,
            // 保留原始名称，渲染时根据当前语言做翻译
            name: data[key].name || key,
            type: data[key].type,
            model: data[key].model,
          }));
          arr.sort((a, b) => a.name.localeCompare(b.name));
          setCameras(arr);
        } else {
          setCameras([]);
        }
      } catch (error) {
        console.error('加载摄像机模型库失败:', error);
        setCameras([]);
      } finally {
        setLoading(false);
      }
    };

    loadCameras();
  }, []);

  useEffect(() => {
    const loadPositionPresets = async () => {
      try {
        const res = await fetch(getAssetPath('/models/cameras/camera-positions.json'));
        if (res.ok) {
          const data = await res.json();
          setPositionPresets(Array.isArray(data.presets) ? data.presets : []);
        }
      } catch {
        setPositionPresets([]);
      }
    };
    loadPositionPresets();
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

  const handleAddCamera = (cam: CameraDef) => {
    if (!canvasRef?.current) return;
    const modelPath = cam.model || `cameras/${cam.id}.glb`;
    const path = getAssetPath(`/models/${modelPath}`);
    canvasRef.current.addObject(path, cam.id);
  };

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

  const cameraIds = new Set(cameras.map((c) => c.id));
  const sceneCameras = sceneObjects.filter((o) => cameraIds.has(o.id));

  return (
    <div className="border-t-2 border-black dark:border-white pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-bold uppercase mb-2 hover:bg-gray-100 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded"
      >
        {t('pose3d.cameraLibrary')}
        <span className="text-xs">{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <>
          {loading ? (
            <div className="text-xs text-gray-500">{t('pose3d.loading')}</div>
          ) : (
            <>
              <label className="block text-xs font-bold uppercase mb-1">
                {t('pose3d.addCamera')}
              </label>
              <div className="flex gap-2 mb-2">
                <select
                  value={selectedToAdd}
                  onChange={(e) => setSelectedToAdd(e.target.value)}
                  className="pixel-border-button flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-700 min-w-0"
                  aria-label={t('pose3d.selectCamera')}
                >
                  <option value="">{t('pose3d.selectCameraPlaceholder')}</option>
                  {cameras.map((cam) => {
                    // 动态翻译摄像机名称：pose3d.camera.<id>
                    const translationKey = `pose3d.camera.${cam.id}`;
                    const translated = (t as any)(translationKey) as string;
                    const label = translated && translated !== translationKey ? translated : cam.name || cam.id;
                    return (
                      <option key={cam.id} value={cam.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const cam = cameras.find((c) => c.id === selectedToAdd);
                    if (cam) handleAddCamera(cam);
                  }}
                  disabled={!selectedToAdd}
                  className="pixel-border-button px-3 py-1 text-xs bg-black text-white dark:bg-white dark:text-black shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + {t('pose3d.add')}
                </button>
              </div>
            </>
          )}

          {sceneCameras.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold uppercase">
                  {t('pose3d.sceneCamerasCount').replace('{count}', String(sceneCameras.length))}
                </label>
                {selectedObjectId && cameraIds.has(selectedObjectId) && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => canvasRef?.current?.setViewFromObjectId(selectedObjectId)}
                      className="pixel-border-button px-2 py-0.5 text-xs bg-black text-white dark:bg-white dark:text-black"
                    >
                      {t('pose3d.useAsView')}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearObjectSelection}
                      className="pixel-border-button px-2 py-0.5 text-xs bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                    >
                      {t('pose3d.deselect')}
                    </button>
                  </div>
                )}
              </div>
              {selectedObjectId && cameraIds.has(selectedObjectId) && positionPresets.length > 0 && (
                <div className="mb-2">
                  <label className="block text-xs font-bold uppercase mb-1">
                    {t('pose3d.cameraPositionPresets')}
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    {positionPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => canvasRef?.current?.applyCameraPositionPreset(selectedObjectId, preset)}
                        className="pixel-border-button px-2 py-0.5 text-xs bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="retro-window space-y-1 max-h-32 overflow-y-auto p-2 bg-white dark:bg-gray-900">
                {sceneCameras.map((obj) => {
                  const isSelected = selectedObjectId === obj.id;
                  return (
                    <div
                      key={obj.id}
                      onClick={() => handleSelectObject(obj.id)}
                      className={`flex items-center justify-between p-2 text-xs cursor-pointer rounded ${
                        isSelected
                          ? 'ring-2 ring-primary bg-gray-100 dark:bg-gray-800'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-3 h-3 shrink-0 border-2 border-black dark:border-white ${
                            isSelected ? 'bg-black dark:bg-white' : 'bg-transparent'
                          }`}
                        />
                        <span className="truncate font-medium">{obj.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRemoveObject(obj.id); }}
                        className="pixel-border-button px-2 py-0.5 text-xs shrink-0 hover:bg-red-100 dark:hover:bg-red-900"
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
