import { useEffect, useMemo, useState } from 'react';
import { PoseEditorCanvasRef } from './PoseEditorCanvas';
import { getAssetPath } from '../../../utils/pathUtils';
import { useTranslation } from '../../../i18n/useTranslation';
import { autoTranslatePoseNameToZh } from '../../../utils/poseNameUtils';
import { PoseThumb } from './PoseThumb';
import { FloatingPanel } from '../drawing/FloatingPanel';
import {
  enqueuePoseThumbGeneration,
  resumePoseThumbGeneration,
  warmPoseThumbCache,
} from './poseThumbService';

interface ActionLibraryPanelProps {
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Standalone action library window — must mount under float-root (not inside another panel). */
export function ActionLibraryPanel({ canvasRef, open, onOpenChange }: ActionLibraryPanelProps) {
  const { t, language } = useTranslation();
  const [poses, setPoses] = useState<any[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const loadPoses = async () => {
      try {
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
        }
      } catch {
        /* keep empty */
      }
    };
    void loadPoses();
  }, []);

  useEffect(() => {
    if (!poses.length) return;
    resumePoseThumbGeneration();
    const ids = poses.map((p) => String(p.id || p.name || '')).filter(Boolean);
    void warmPoseThumbCache(ids).then(() => enqueuePoseThumbGeneration(poses));
  }, [poses]);

  const poseLabel = (pose: any) => {
    const rawName = pose.label || pose.name || `Pose ${pose.id}`;
    if (language === 'zh') return autoTranslatePoseNameToZh(rawName);
    const translationKey = `pose3d.pose.${pose.id}`;
    const translated = (t as (k: string) => string)(translationKey);
    return translated && translated !== translationKey ? translated : rawName;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return poses;
    return poses.filter((pose) => {
      const label = poseLabel(pose).toLowerCase();
      const name = String(pose.name || '').toLowerCase();
      return label.includes(q) || name.includes(q) || String(pose.id).includes(q);
    });
  }, [poses, query, language]);

  useEffect(() => {
    if (!open || !poses.length) return;
    resumePoseThumbGeneration();
    enqueuePoseThumbGeneration(filtered.length ? filtered : poses);
  }, [open, filtered, poses]);

  const handlePresetSelect = (pose: any) => {
    if (!canvasRef?.current) return;
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
    <FloatingPanel
      id="pose-action-library"
      title={t('pose3d.actionLibrary')}
      defaultPos={{ x: 300, y: 72 }}
      open={open}
      onOpenChange={onOpenChange}
      width={340}
      defaultHeight={480}
      zIndex={70}
    >
      <div className="flex flex-col gap-2 h-full min-h-0" style={{ maxHeight: 'min(70vh, 520px)' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pose3d.searchPoses')}
          className="w-full px-2 py-1 text-sm border border-black/30 dark:border-white/30 bg-transparent shrink-0"
          style={{ borderRadius: 0 }}
        />
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          <div className="grid grid-cols-3 gap-1.5">
            {filtered.map((pose) => {
              const label = poseLabel(pose);
              const id = String(pose.id || pose.name || '');
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePresetSelect(pose)}
                  className="pose-lib-thumb text-left flex flex-col gap-0.5 border border-black/20 dark:border-white/20 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 p-0 overflow-hidden"
                  style={{ borderRadius: 0 }}
                  title={label}
                >
                  <PoseThumb poseId={id} pose={pose} label={label} />
                  <span className="text-[10px] leading-tight line-clamp-2 px-0.5 pb-0.5 text-center">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}
