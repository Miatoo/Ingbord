import { useProjectStore } from '../../../store/projectStore';
import { PoseEditorCanvasRef } from './PoseEditorCanvas';
import { useEffect, useState } from 'react';
import { getAssetPath } from '../../../utils/pathUtils';
import { useTranslation } from '../../../i18n/useTranslation';
import { autoTranslateHandPoseNameToZh } from '../../../utils/poseNameUtils';

interface HandPosePresetsProps {
  shotId: string;
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
}

export function HandPosePresets({ shotId, canvasRef }: HandPosePresetsProps) {
  const { t, language } = useTranslation();
  const getShot = useProjectStore((state) => state.getShot);
  const [handPoses, setHandPoses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [handSide, setHandSide] = useState<'both' | 'left' | 'right'>('both');

  const shot = getShot(shotId);

  useEffect(() => {
    const loadHandPoses = async () => {
      try {
        setLoading(true);
        const response = await fetch(getAssetPath('/models/poses/hand-poses.json'));
        if (response.ok) {
          const data = await response.json();
          const posesArray = Object.keys(data).map((key) => ({
            id: key,
            ...data[key],
            // 原始名称，实际显示时再根据语言从 i18n 中取翻译
            label: data[key].name || key,
          }));
          posesArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setHandPoses(posesArray);
        } else {
          setHandPoses([]);
        }
      } catch (error) {
        console.error('加载手部动作库失败:', error);
        setHandPoses([]);
      } finally {
        setLoading(false);
      }
    };

    loadHandPoses();
  }, []);

  const handleHandPoseSelect = (pose: any) => {
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

    // 根据 handSide 选择应用到右手、左手或双手
    const originalHand = pose.state?.handSkeleton ?? {};
    const nextHand: Record<string, any> = {};

    Object.entries(originalHand).forEach(([boneName, boneData]) => {
      const name = String(boneName);
      const isRight = name.startsWith('RightHand');
      const isLeft = name.startsWith('LeftHand');

      // 右手
      if (handSide === 'right' || handSide === 'both') {
        nextHand[name] = boneData;
      }

      // 左手：已有 LeftHand 直接用；只有 RightHand 时镜像到 LeftHand*
      if (handSide === 'left' || handSide === 'both') {
        if (isLeft) {
          nextHand[name] = boneData;
        } else if (isRight) {
          const leftName = name.replace(/^RightHand/, 'LeftHand');
          nextHand[leftName] = boneData;
        }
      }
    });

    const poseData = { state: { handSkeleton: nextHand } };
    const result = canvasRef.current.applyPose(selectedId, poseData);
    if (!result.applied && result.messageKey) {
      alert(t(result.messageKey as any));
    }
  };

  return (
    <div className="border-t-2 border-black dark:border-white pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-bold uppercase mb-2 hover:bg-gray-100 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded"
      >
        {loading ? t('pose3d.handPosePresets') : t('pose3d.handPosePresetsCount').replace('{count}', String(handPoses.length))}
        <span className="text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <>
          {loading ? (
            <div className="text-xs text-gray-500 mb-2">{t('pose3d.loading')}</div>
          ) : handPoses.length > 0 ? (
            <>
              {/* 左右手选择 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {t('pose3d.handPoseSide.label')}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setHandSide('both')}
                    className={`pixel-border-button px-2 py-0.5 text-xs ${
                      handSide === 'both'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {t('pose3d.handPoseSide.both')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHandSide('left')}
                    className={`pixel-border-button px-2 py-0.5 text-xs ${
                      handSide === 'left'
                        ? 'bg-black text-white dark:bg白 dark:text-black'
                        : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {t('pose3d.handPoseSide.left')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHandSide('right')}
                    className={`pixel-border-button px-2 py-0.5 text-xs ${
                      handSide === 'right'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    {t('pose3d.handPoseSide.right')}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap max-h-28 overflow-y-auto">
                {handPoses.map((pose) => {
                  const rawName = pose.label || pose.name || `Hand ${pose.id}`;
                  let label: string;
                  if (language === 'zh') {
                    label = autoTranslateHandPoseNameToZh(rawName);
                  } else {
                    const translationKey = `pose3d.handPose.${pose.id}`;
                    const translated = (t as any)(translationKey) as string;
                    label = translated && translated !== translationKey ? translated : rawName;
                  }
                  const title = language === 'zh' ? label : (pose.keywords || pose.name || label);
                  return (
                    <button
                      key={pose.id || pose.name}
                      onClick={() => handleHandPoseSelect(pose)}
                      className="pixel-border-button px-3 py-1 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-xs whitespace-nowrap"
                      title={title}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('pose3d.applyHandPoseHint')}</p>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
