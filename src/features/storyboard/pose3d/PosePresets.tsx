import { useProjectStore } from '../../../store/projectStore';
import { PoseEditorCanvasRef } from './PoseEditorCanvas';
import { useEffect, useState } from 'react';
import { getAssetPath } from '../../../utils/pathUtils';
import { useTranslation } from '../../../i18n/useTranslation';
import { autoTranslatePoseNameToZh } from '../../../utils/poseNameUtils';
import {
  enqueuePoseThumbGeneration,
  resumePoseThumbGeneration,
  warmPoseThumbCache,
} from './poseThumbService';

interface PosePresetsProps {
  shotId: string;
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
  onOpenActionLibrary?: () => void;
}

export function PosePresets({ shotId, canvasRef, onOpenActionLibrary }: PosePresetsProps) {
  const { t, language } = useTranslation();
  const getShot = useProjectStore((state) => state.getShot);
  const [poses, setPoses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const shot = getShot(shotId);

  useEffect(() => {
    const loadPoses = async () => {
      try {
        setLoading(true);
        const response = await fetch(getAssetPath('/models/poses/poses.json'));
        if (response.ok) {
          const data = await response.json();
          const posesArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
            label: data[key].name || key,
          }));
          posesArray.sort((a, b) => {
            const aName = a.name?.toLowerCase() || '';
            const bName = b.name?.toLowerCase() || '';
            const pri = (n: string) =>
              ['stand', 'sit', 'walk', 'run'].find((p) => n.includes(p)) ? 1 : 999;
            return pri(aName) - pri(bName);
          });
          setPoses(posesArray);
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        setPoses([
          { id: '1', name: 'standing', label: 'standing', state: { skeleton: {} } },
          { id: '2', name: 'sitting', label: 'sitting', state: { skeleton: {} } },
          { id: '3', name: 'walking', label: 'walking', state: { skeleton: {} } },
          { id: '4', name: 'running', label: 'running', state: { skeleton: {} } },
        ]);
      } finally {
        setLoading(false);
      }
    };
    loadPoses();
  }, []);

  useEffect(() => {
    if (!poses.length) return;
    resumePoseThumbGeneration();
    const ids = poses.map((p) => String(p.id || p.name || '')).filter(Boolean);
    void warmPoseThumbCache(ids).then(() => {
      enqueuePoseThumbGeneration(poses);
    });
  }, [poses]);

  const poseLabel = (pose: any) => {
    const rawName = pose.label || pose.name || `Pose ${pose.id}`;
    if (language === 'zh') return autoTranslatePoseNameToZh(rawName);
    const translationKey = `pose3d.pose.${pose.id}`;
    const translated = (t as (k: string) => string)(translationKey);
    return translated && translated !== translationKey ? translated : rawName;
  };

  const handlePresetSelect = (pose: any) => {
    if (!shot || !canvasRef?.current) return;
    const characters = canvasRef.current.getCharacters();
    if (characters.length === 0) {
      alert(t('pose3d.alertAddCharacterFirst'));
      return;
    }
    const selectedId = canvasRef.current.getSelectedCharacterId() || characters[0]?.id;
    if (!selectedId) {
      alert(t('pose3d.alertNoAvailableCharacter'));
      return;
    }
    const result = canvasRef.current.applyPose(selectedId, pose);
    if (!result.applied && result.messageKey) {
      alert(t(result.messageKey as 'pose3d.alertAddCharacterFirst'));
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
            ? t('pose3d.posePresets')
            : t('pose3d.posePresetsCount').replace('{count}', String(poses.length))}
          <span className="text-xs">{expanded ? '▼' : '▶'}</span>
        </button>
        <button
          type="button"
          className="pixel-border-button px-2 py-1 text-xs shrink-0"
          onClick={() => onOpenActionLibrary?.()}
        >
          {t('pose3d.openActionLibrary')}
        </button>
      </div>

      {expanded && !loading && (
        <>
          <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto mb-1">
            {poses.slice(0, 24).map((pose) => (
              <button
                key={pose.id || pose.name}
                type="button"
                onClick={() => handlePresetSelect(pose)}
                className="pixel-border-button px-2 py-0.5 text-xs whitespace-nowrap"
              >
                {poseLabel(pose)}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400">{t('pose3d.applyPoseHint')}</p>
        </>
      )}
      {loading && <div className="text-xs text-gray-500">{t('pose3d.loading')}</div>}
    </div>
  );
}
