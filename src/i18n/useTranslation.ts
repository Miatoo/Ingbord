import { useCallback } from 'react';
import { useUIStore } from '../store/uiStore';
import { translations, TranslationKey } from './translations';

export function useTranslation() {
  const language = useUIStore((state) => state.language);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[language][key] || key;
    },
    [language]
  );

  return { t, language };
}
