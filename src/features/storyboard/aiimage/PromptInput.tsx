import { PromptTemplates, PromptTemplate } from './PromptTemplates';
import { useTranslation } from '../../../i18n/useTranslation';

interface PromptInputProps {
  prompt: string;
  negativePrompt?: string;
  onPromptChange: (prompt: string) => void;
  onNegativePromptChange?: (negativePrompt: string) => void;
}

export function PromptInput({
  prompt,
  negativePrompt,
  onPromptChange,
  onNegativePromptChange,
}: PromptInputProps) {
  const { t } = useTranslation();
  const handleSelectTemplate = (template: PromptTemplate) => {
    onPromptChange(template.prompt);
    if (template.negativePrompt && onNegativePromptChange) {
      onNegativePromptChange(template.negativePrompt);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('aiImage.prompt.label')} <span className="text-red-500">*</span>
          </label>
          <PromptTemplates onSelectTemplate={handleSelectTemplate} />
        </div>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t('aiImage.prompt.placeholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={6}
        />
        <p className="text-xs text-gray-500 mt-1">
          {t('aiImage.prompt.charCount').replace('{count}', String(prompt.length))}
        </p>
      </div>

      {onNegativePromptChange && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('aiImage.negativePrompt.label')}
          </label>
          <textarea
            value={negativePrompt || ''}
            onChange={(e) => onNegativePromptChange(e.target.value)}
            placeholder={t('aiImage.negativePrompt.placeholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
          />
        </div>
      )}
    </div>
  );
}

