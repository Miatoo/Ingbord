import { useState, useEffect } from 'react';
import { AIImageConfig } from '../../../types';
import { getAIImageConfig, saveAIImageConfig, validateAPIConfig } from '../../../services/aiImageService';
import { useTranslation } from '../../../i18n/useTranslation';

interface APIConfigPanelProps {
  onConfigChange?: (config: AIImageConfig | null) => void;
}

export function APIConfigPanel({ onConfigChange }: APIConfigPanelProps) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AIImageConfig | null>(getAIImageConfig());
  const [apiEndpoint, setApiEndpoint] = useState(config?.apiEndpoint || '');
  const [apiKey, setApiKey] = useState(config?.apiKey || '');
  const [modelName, setModelName] = useState(config?.modelName || '');
  const [isValidating, setIsValidating] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string>('');

  useEffect(() => {
    const saved = getAIImageConfig();
    if (saved) {
      setConfig(saved);
      setApiEndpoint(saved.apiEndpoint);
      setApiKey(saved.apiKey);
      setModelName(saved.modelName);
    }
  }, []);

  const handleSave = () => {
    if (!apiEndpoint || !apiKey || !modelName) {
      setValidationMessage(t('settings.aiImageConfig.fillAll'));
      return;
    }

    const newConfig: AIImageConfig = {
      apiEndpoint: apiEndpoint.trim(),
      apiKey: apiKey.trim(),
      modelName: modelName.trim(),
    };

    saveAIImageConfig(newConfig);
    setConfig(newConfig);
    setValidationMessage(t('settings.aiImageConfig.saved'));
    onConfigChange?.(newConfig);

    // 清除成功消息
    setTimeout(() => setValidationMessage(''), 2000);
  };

  const handleTest = async () => {
    if (!apiEndpoint || !apiKey || !modelName) {
      setValidationMessage(t('settings.aiImageConfig.fillFirst'));
      return;
    }

    setIsValidating(true);
    setValidationMessage(t('settings.aiImageConfig.testing'));

    try {
      const testConfig: AIImageConfig = {
        apiEndpoint: apiEndpoint.trim(),
        apiKey: apiKey.trim(),
        modelName: modelName.trim(),
      };

      const isValid = await validateAPIConfig(testConfig);
      if (isValid) {
        setValidationMessage(t('settings.aiImageConfig.connectionSuccessShort'));
      } else {
        setValidationMessage(t('settings.aiImageConfig.connectionFailed'));
      }
    } catch (error: any) {
      setValidationMessage(`${t('settings.aiImageConfig.testFailedPrefix')}${error.message}`);
    } finally {
      setIsValidating(false);
      setTimeout(() => setValidationMessage(''), 3000);
    }
  };

  const isConfigured = config !== null && config.apiEndpoint && config.apiKey && config.modelName;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{t('settings.aiImageConfig.panelTitle')}</h3>
        {isConfigured && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
            {t('settings.aiImageConfig.configured')}
          </span>
        )}
      </div>

      {!isConfigured && (
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
          {t('settings.aiImageConfig.needConfigHint')}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('settings.aiImageConfig.apiEndpoint')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            placeholder={t('settings.aiImageConfig.apiEndpoint.placeholder')}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('settings.aiImageConfig.apiKey')} <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t('settings.aiImageConfig.apiKey.placeholder')}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {t('settings.aiImageConfig.modelName')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder={t('settings.aiImageConfig.modelName.placeholder')}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {validationMessage && (
        <div className={`text-xs p-2 rounded ${
          validationMessage.startsWith('✓')
            ? 'text-green-700 bg-green-50'
            : validationMessage.startsWith('✗')
            ? 'text-red-700 bg-red-50'
            : 'text-blue-700 bg-blue-50'
        }`}>
          {validationMessage}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {t('settings.aiImageConfig.save')}
        </button>
        <button
          onClick={handleTest}
          disabled={isValidating || !apiEndpoint || !apiKey || !modelName}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isValidating ? t('settings.aiImageConfig.testing') : t('settings.aiImageConfig.test')}
        </button>
      </div>
    </div>
  );
}

