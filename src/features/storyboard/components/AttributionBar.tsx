import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../../i18n/useTranslation';
import { getFallbackSitePage, type SitePage } from './sitePagesFallback';

const FOOTER_LINKS: { slug: string; labelKey: string }[] = [
  { slug: 'thanks', labelKey: 'footer.thanks' },
  { slug: 'contact', labelKey: 'footer.contact' },
  { slug: 'project', labelKey: 'footer.project' },
  { slug: 'terms', labelKey: 'footer.terms' },
  { slug: 'privacy', labelKey: 'footer.privacy' },
  { slug: 'about', labelKey: 'footer.about' },
];

function renderBody(body: string) {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={`${i}-${part}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all text-blue-600 dark:text-blue-300"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function AttributionBar() {
  const { t, language } = useTranslation();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [page, setPage] = useState<SitePage | null>(null);

  useEffect(() => {
    if (!openSlug) {
      setPage(null);
      return;
    }
    const lang = language === 'en' ? 'en' : 'zh';
    setPage(getFallbackSitePage(openSlug, lang));
  }, [openSlug, language]);

  return (
    <>
      <div className="w-full px-3 py-1.5 text-[11px] leading-4 border-t border-black/20 dark:border-white/20 bg-white/70 dark:bg-black/30 backdrop-blur">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-gray-700 dark:text-gray-200">
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.slug} className="inline-flex items-center gap-x-2">
              {i > 0 && <span className="opacity-40">·</span>}
              <button
                type="button"
                className="underline hover:opacity-80"
                onClick={() => setOpenSlug(link.slug)}
              >
                {t(link.labelKey)}
              </button>
            </span>
          ))}
        </div>
      </div>
      {openSlug &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setOpenSlug(null)}
          >
            <div
              className="retro-window w-full max-w-lg max-h-[80vh] overflow-hidden bg-white dark:bg-gray-800 theme-text flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="retro-header">
                <span>
                  {(
                    page?.title ||
                    t(FOOTER_LINKS.find((l) => l.slug === openSlug)?.labelKey || '')
                  ).toUpperCase()}
                </span>
                <button type="button" onClick={() => setOpenSlug(null)} aria-label="close">
                  ×
                </button>
              </div>
              <div className="p-4 overflow-y-auto text-sm whitespace-pre-wrap allow-select">
                {renderBody(
                  page?.body ||
                    getFallbackSitePage(openSlug, language === 'en' ? 'en' : 'zh')?.body ||
                    t('footer.loadFailed')
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
