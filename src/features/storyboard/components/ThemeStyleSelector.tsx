import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore, ThemeStyle } from '../../../store/uiStore';
import { useTranslation } from '../../../i18n/useTranslation';
import { TranslationKey } from '../../../i18n/translations';

const THEMES: { value: ThemeStyle; labelKey: TranslationKey; icon: string }[] = [
  { value: 'retro-pixel', labelKey: 'theme.retro-pixel', icon: '🎮' },
  { value: 'modern', labelKey: 'theme.modern', icon: '✨' },
  { value: 'classic', labelKey: 'theme.classic', icon: '📋' },
  { value: 'retro-story', labelKey: 'theme.retro-story', icon: '📖' },
  { value: 'desert-mirage', labelKey: 'theme.desert-mirage', icon: '🌵' },
  { value: 'cinematic-glass', labelKey: 'theme.cinematic-glass', icon: '🎬' },
  { value: 'sticker-kawaii', labelKey: 'theme.sticker-kawaii', icon: '📒' },
  { value: 'night-black', labelKey: 'theme.night-black', icon: '🌙' },
  { value: 'yingge', labelKey: 'theme.yingge', icon: '✦' },
];

export function ThemeStyleSelector({
  block = false,
  iconOnly = false,
}: {
  block?: boolean;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const themeStyle = useUIStore((state) => state.themeStyle);
  const setThemeStyle = useUIStore((state) => state.setThemeStyle);
  const [showMenu, setShowMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentTheme = THEMES.find((th) => th.value === themeStyle) || THEMES[0];

  return (
    <>
      <div className={block ? 'w-full' : 'relative'}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className={
            iconOnly
              ? 'pixel-border-button tablet-icon-btn'
              : `pixel-border-button shrink-0 bg-white dark:bg-gray-700 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 text-sm ${
                  block ? 'w-full h-9 justify-start' : 'min-h-10'
                }`
          }
          title={t('header.themeSelector')}
          aria-label={t('header.themeSelector')}
        >
          <span>{currentTheme.icon}</span>
          {!iconOnly && <span className="truncate">{t(currentTheme.labelKey)}</span>}
        </button>
      </div>
      {showMenu &&
        createPortal(
          <div
            className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowMenu(false)}
          >
            <div
              className="retro-window bg-white dark:bg-gray-900 w-full max-w-sm max-h-[min(80vh,28rem)] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="retro-header shrink-0">
                <span>{t('header.themeSelector.title')}</span>
                <button
                  type="button"
                  onClick={() => setShowMenu(false)}
                  className="text-white dark:text-black hover:opacity-70"
                >
                  ×
                </button>
              </div>
              <div className="p-2 space-y-1 overflow-y-auto overscroll-contain min-h-0 flex-1">
                {THEMES.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => {
                      setThemeStyle(theme.value);
                      setShowMenu(false);
                    }}
                    className={`pixel-border-button w-full px-3 py-2 text-left flex items-center gap-2 text-sm ${
                      themeStyle === theme.value
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                  >
                    <span>{theme.icon}</span>
                    <span className="truncate">{t(theme.labelKey)}</span>
                    {themeStyle === theme.value && <span className="ml-auto">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
