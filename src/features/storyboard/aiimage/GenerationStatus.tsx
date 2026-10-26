import { useTranslation } from '../../../i18n/useTranslation';

interface GenerationStatusProps {
  status: 'idle' | 'generating' | 'success' | 'error';
  progress?: number; // 0-100
  errorMessage?: string;
}

export function GenerationStatus({
  status,
  progress = 0,
  errorMessage,
}: GenerationStatusProps) {
  const { t } = useTranslation();

  if (status === 'idle') {
    return null;
  }

  if (status === 'generating') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-700">{t('aiImage.status.generating')}</span>
          <span className="text-gray-500">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
        <div className="font-medium mb-1">{t('aiImage.status.failed')}</div>
        <div className="text-xs">{errorMessage || t('aiImage.status.unknownError')}</div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
        <div className="font-medium">{t('aiImage.status.success')}</div>
      </div>
    );
  }

  return null;
}

