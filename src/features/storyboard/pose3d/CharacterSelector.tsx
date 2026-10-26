import { useTranslation } from '../../../i18n/useTranslation';
import { BUILT_IN_CHARACTERS } from './builtInCharacters';

interface CharacterSelectorProps {
  shotId: string;
  onCharacterChange: (modelPath: string) => void;
  currentModelPath: string;
}

export function CharacterSelector({
  shotId: _shotId,
  onCharacterChange,
  currentModelPath,
}: CharacterSelectorProps) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">{t('pose3d.characterModel')}</h3>
      <div className="grid grid-cols-2 gap-2">
        {BUILT_IN_CHARACTERS.map((model) => (
          <button
            key={model.path}
            type="button"
            onClick={() => onCharacterChange(model.path)}
            className={`px-3 py-2 rounded text-xs transition-colors ${
              currentModelPath === model.path
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t(model.key as 'pose3d.character.adultMale')}
          </button>
        ))}
      </div>
    </div>
  );
}
