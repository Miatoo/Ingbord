import { ImageVersion } from '../../../types';
import { useTranslation } from '../../../i18n/useTranslation';

interface VersionSelectorProps {
  versions: ImageVersion[];
  activeVersionId?: string;
  onSelectVersion: (versionId: string) => void;
  onDeleteVersion?: (versionId: string) => void;
}

export function VersionSelector({
  versions,
  activeVersionId,
  onSelectVersion,
  onDeleteVersion,
}: VersionSelectorProps) {
  const { t, language } = useTranslation();
  if (versions.length <= 1) {
    return null;
  }

  const locale = language === 'zh' ? 'zh-CN' : 'en-US';

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">{t('aiImage.versions.title')}</h3>
      <div className="space-y-2">
        {versions.map((version) => {
          const isActive = version.id === activeVersionId;
          const isOriginal = version.source === 'original';

          return (
            <div
              key={version.id}
              className={`
                border rounded p-2 cursor-pointer transition-colors
                ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
              `}
              onClick={() => onSelectVersion(version.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src={version.image}
                    alt={isOriginal ? t('aiImage.versions.original') : t('aiImage.versions.aiGenerated')}
                    className="w-12 h-12 object-cover rounded"
                  />
                  <div>
                    <div className="text-xs font-medium">
                      {isOriginal ? t('aiImage.versions.original') : t('aiImage.versions.aiGenerated')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(version.createdAt).toLocaleString(locale)}
                    </div>
                    {version.aiPrompt && (
                      <div className="text-xs text-gray-400 mt-1 truncate max-w-xs">
                        {version.aiPrompt}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActive && (
                    <span className="text-xs text-blue-600 font-medium">{t('aiImage.versions.current')}</span>
                  )}
                  {onDeleteVersion && !isOriginal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t('aiImage.versions.deleteConfirm'))) {
                          onDeleteVersion(version.id);
                        }
                      }}
                      className="text-xs text-red-600 hover:text-red-700 px-2 py-1"
                    >
                      {t('aiImage.versions.delete')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

