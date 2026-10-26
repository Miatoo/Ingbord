import { useEffect, useState } from 'react';
import { useProjectStore } from '../../../store/projectStore';
import { Framing, CameraAngle } from '../../../types';
import { useTranslation } from '../../../i18n/useTranslation';
import { getAssetPath } from '../../../utils/pathUtils';

interface CameraControlsProps {
  shotId: string;
}

const defaultFraming: Framing[] = ['CU', 'MS', 'WS', 'ECU', 'ELS'];

const defaultAngles = [
  { angle: 'eye' as CameraAngle, height: 1.6, label: 'Eye (1.6m)' },
  { angle: 'low' as CameraAngle, height: 1.2, label: 'Low (1.2m)' },
  { angle: 'high' as CameraAngle, height: 2.0, label: 'High (2.0m)' },
  { angle: 'low' as CameraAngle, height: 0.8, label: 'Low (0.8m)' },
  { angle: 'high' as CameraAngle, height: 2.5, label: 'High (2.5m)' },
  { angle: 'eye' as CameraAngle, height: 1.4, label: 'Eye (1.4m)' },
  { angle: 'eye' as CameraAngle, height: 1.8, label: 'Eye (1.8m)' },
];

function formatAngleLabel(
  language: string,
  angle: CameraAngle,
  height: number,
  t: (key: any) => string
): string {
  const angleLabel = t(`cameraAngle.${angle}` as any);
  if (language === 'zh') {
    return `${angleLabel}（${height}米）`;
  }
  return `${angleLabel} (${height}m)`;
}

export function CameraControls({ shotId }: CameraControlsProps) {
  const { t, language } = useTranslation();
  const getShot = useProjectStore((state) => state.getShot);
  const updateShot = useProjectStore((state) => state.updateShot);
  const [framingOptions, setFramingOptions] = useState<Framing[]>(defaultFraming);
  const [anglePresets, setAnglePresets] = useState(defaultAngles);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(getAssetPath('/models/cameras/camera-presets.json'));
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.framing) && data.framing.length > 0) {
          setFramingOptions(data.framing as Framing[]);
        }
        if (Array.isArray(data.angles) && data.angles.length > 0) {
          setAnglePresets(data.angles.map((a: any) => ({
            angle: (a.angle || 'eye') as CameraAngle,
            height: Number(a.height) ?? 1.6,
            label: a.label || `${a.angle} (${a.height}m)`,
          })));
        }
      } catch {
        // 使用默认预设
      }
    };
    load();
  }, []);

  const shot = getShot(shotId);
  if (!shot) return null;

  const handleFramingChange = (framing: Framing) => {
    updateShot(shotId, { framing });
  };

  const handlePresetSelect = (preset: { angle: CameraAngle }) => {
    updateShot(shotId, { cameraAngle: preset.angle });
  };

  return (
    <div className="border-t-2 border-black dark:border-white pt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-sm font-bold uppercase mb-2 hover:bg-gray-100 dark:hover:bg-gray-800 -mx-2 px-2 py-1 rounded"
      >
        {t('pose3d.cameraControls')}
        <span className="text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="space-y-3">
          <div className="mb-3">
            <label className="block text-xs font-bold uppercase mb-1">{t('pose3d.framing')}</label>
            <div className="flex gap-1 flex-wrap">
              {framingOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => handleFramingChange(option)}
                  className={`pixel-border-button px-2 py-1 text-xs ${
                    shot.framing === option
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {language === 'zh'
                    ? t(`framing.${option}` as any)
                    : `${t(`framing.${option}` as any)} (${option})`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase mb-1">{t('pose3d.cameraAnglePresets')}</label>
            <div className="flex gap-1 flex-wrap">
              {anglePresets.map((preset, index) => (
                <button
                  key={index}
                  onClick={() => handlePresetSelect(preset)}
                  className={`pixel-border-button px-2 py-1 text-xs ${
                    shot.cameraAngle === preset.angle
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  {formatAngleLabel(language, preset.angle, preset.height, t)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
