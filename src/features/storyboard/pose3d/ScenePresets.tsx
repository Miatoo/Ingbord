import { useRef, useEffect, useState } from 'react';
import { PoseEditorCanvasRef } from './PoseEditorCanvas';
import { getAssetPath } from '../../../utils/pathUtils';
import { useTranslation } from '../../../i18n/useTranslation';

interface ScenePresetsProps {
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
}

interface ScenePresetItem {
  id: string;
  name: string;
  poseId?: string;
  camera?: { position: [number, number, number]; target: [number, number, number] };
}

export function ScenePresets({ canvasRef }: ScenePresetsProps) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<ScenePresetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [cameraIds, setCameraIds] = useState<Set<string>>(new Set());
  const posesCacheRef = useRef<Record<string, any>>({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [presetsRes, camerasRes] = await Promise.all([
          fetch(getAssetPath('/models/cameras/camera-scene-presets.json')),
          fetch(getAssetPath('/models/cameras/cameras.json')),
        ]);
        if (presetsRes.ok) {
          const data = await presetsRes.json();
          setPresets(Array.isArray(data.presets) ? data.presets : []);
        }
        if (camerasRes.ok) {
          const camData = await camerasRes.json();
          setCameraIds(new Set(Object.keys(camData)));
        }
      } catch (e) {
        console.error('加载场景预设失败:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getPoseById = async (poseId: string): Promise<any | null> => {
    if (posesCacheRef.current[poseId]) return posesCacheRef.current[poseId];
    try {
      const res = await fetch(getAssetPath('/models/cameras/poses.json'));
      if (!res.ok) return null;
      const data = await res.json();
      const pose = data[poseId];
      if (pose) posesCacheRef.current[poseId] = pose;
      return pose || null;
    } catch {
      return null;
    }
  };

  const handleApply = async (preset: ScenePresetItem) => {
    if (!canvasRef?.current) return;

    if (preset.poseId) {
      const characters = canvasRef.current.getCharacters();
      if (characters.length > 0) {
        const selectedId = canvasRef.current.getSelectedCharacterId() || characters[0]?.id;
        if (selectedId) {
          const pose = await getPoseById(preset.poseId);
          if (pose) {
            const result = canvasRef.current.applyPose(selectedId, pose);
            if (!result.applied && result.messageKey) alert(t(result.messageKey as any));
          }
        }
      }
    }

    if (preset.camera) {
      const selectedObjectId = canvasRef.current.getSelectedObjectId();
      if (selectedObjectId && cameraIds.has(selectedObjectId)) {
        canvasRef.current.applyCameraPositionPreset(selectedObjectId, preset.camera);
      } else {
        canvasRef.current.setViewerCamera(preset.camera.position, preset.camera.target);
      }
    }
  };

  if (presets.length === 0 && !loading) return null;

  return (
    <div className="border-t-2 border-black dark:border-white pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-bold uppercase mb-2 hover:bg-gray-100 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded"
      >
        {t('pose3d.scenePresets')}
        <span className="text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <>
          <p className="text-xs text-gray-400 mb-2">{t('pose3d.scenePresetsHint')}</p>
          {loading ? (
            <div className="text-xs text-gray-500 mb-2">{t('pose3d.loading')}</div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {presets.map((preset) => {
                // 动态翻译场景预设名称：pose3d.scenePreset.<id>；找不到时回退到 JSON 里的 name
                const key = `pose3d.scenePreset.${preset.id}`;
                const translated = (t as any)(key) as string;
                const label = translated && translated !== key ? translated : preset.name;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApply(preset)}
                    className="pixel-border-button px-3 py-1 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs whitespace-nowrap"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
