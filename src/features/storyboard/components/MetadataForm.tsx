import { Shot, Framing, CameraAngle, ShotType } from '../../../types';
import { useProjectStore } from '../../../store/projectStore';
import { useTranslation } from '../../../i18n/useTranslation';

interface MetadataFormProps {
  shot: Shot;
}

const framingOptions: Framing[] = ['CU', 'MS', 'WS', 'ECU', 'ELS'];
const cameraAngleOptions: CameraAngle[] = ['low', 'eye', 'high'];
const shotTypeOptions: ShotType[] = ['static', 'push', 'pull', 'pan', 'tilt', 'dolly'];

export function MetadataForm({ shot }: MetadataFormProps) {
  const { t, language } = useTranslation();
  const updateShot = useProjectStore((state) => state.updateShot);
  const getActiveImageVersion = useProjectStore((state) => state.getActiveImageVersion);
  const setActiveImageVersion = useProjectStore((state) => state.setActiveImageVersion);

  const handleChange = (field: keyof Shot, value: any) => {
    updateShot(shot.id, { [field]: value });
  };

  const activeVersion = getActiveImageVersion(shot.id);
  const versions = shot.imageVersions || [];
  const hasMultipleVersions = versions.length > 1;
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  return (
    <div className="space-y-4 theme-text">
      {/* 版本管理 */}
      {hasMultipleVersions && (
        <div className="pb-2 border-b theme-divider">
          <label className="block text-sm font-medium theme-label mb-2">
            {t('metadata.imageVersions.count').replace('{count}', String(versions.length))}
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {versions.map((version, index) => {
              const isActive = activeVersion?.id === version.id;
              return (
                <div
                  key={version.id}
                  className={`retro-window p-2 cursor-pointer ${
                    isActive
                      ? 'ring-2 ring-primary'
                      : 'hover:ring-2 hover:ring-black dark:hover:ring-white'
                  }`}
                  onClick={() => setActiveImageVersion(shot.id, version.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="w-2 h-2 theme-accent-dot rounded-full"></span>
                      )}
                      <span className="text-sm font-medium">
                        {version.source === 'ai_generated' ? t('metadata.imageVersions.aiGenerated') : t('metadata.imageVersions.original')} {index + 1}
                      </span>
                    </div>
                    <span className="text-xs theme-muted">
                      {version.source === 'ai_generated' ? t('metadata.imageVersions.aiGenerated') : t('metadata.imageVersions.originalShort')}
                    </span>
                  </div>
                  {version.createdAt && (
                    <div className="text-xs theme-muted mt-1">
                      {new Date(version.createdAt).toLocaleString(locale)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* 镜头编号 */}
      <div>
        <label className="block text-sm font-medium theme-label mb-1">
          {t('metadata.shotNumber')}
        </label>
        <input
          type="text"
          value={shot.shotNumber}
          onChange={(e) => handleChange('shotNumber', e.target.value)}
          className="theme-input p-2 text-sm leading-normal"
        />
      </div>

      {/* 景别 */}
      <div>
        <label className="block text-sm font-medium theme-label mb-1">
          {t('metadata.framing')}
        </label>
        <select
          value={shot.framing}
          onChange={(e) => handleChange('framing', e.target.value as Framing)}
          className="theme-input p-2 text-sm leading-normal"
        >
          {framingOptions.map((option) => (
            <option key={option} value={option}>
              {t(`framing.${option}` as any)} ({option})
            </option>
          ))}
        </select>
      </div>

      {/* 机位 */}
      <div>
        <label className="block text-sm font-medium theme-label mb-1">
          {t('metadata.cameraAngle')}
        </label>
        <select
          value={shot.cameraAngle}
          onChange={(e) => handleChange('cameraAngle', e.target.value as CameraAngle)}
          className="theme-input p-2 text-sm leading-normal"
        >
          {cameraAngleOptions.map((option) => (
            <option key={option} value={option}>
              {t(`cameraAngle.${option}` as any)} ({option})
            </option>
          ))}
        </select>
      </div>

      {/* 镜头类型 */}
      <div>
        <label className="block text-sm font-medium theme-label mb-1">
          {t('metadata.shotType')}
        </label>
        <select
          value={shot.shotType}
          onChange={(e) => handleChange('shotType', e.target.value as ShotType)}
          className="theme-input p-2 text-sm leading-normal"
        >
          {shotTypeOptions.map((option) => (
            <option key={option} value={option}>
              {t(`shotType.${option}` as any)} ({option})
            </option>
          ))}
        </select>
      </div>

      {/* 时长 */}
      <div>
        <label className="block text-sm font-medium theme-label mb-1">
          {t('metadata.duration')}
        </label>
        <input
          type="number"
          step="0.1"
          min="0"
          value={shot.duration}
          onChange={(e) => handleChange('duration', parseFloat(e.target.value) || 0)}
          className="theme-input p-2 text-sm leading-normal"
        />
      </div>

      {/* 备注 */}
      <div>
        <label className="block text-sm font-medium theme-label mb-1">
          {t('metadata.directorNotes')}
        </label>
        <textarea
          value={shot.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={4}
          className="theme-input p-2 text-sm leading-normal resize-none"
          placeholder={t('metadata.directorNotes.placeholder')}
        />
      </div>
    </div>
  );
}
