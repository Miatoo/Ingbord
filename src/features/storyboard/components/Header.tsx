import { useState, useRef, useEffect, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore, Language } from '../../../store/uiStore';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  exportProjectToLocalFile,
  saveProjectToBoundFile,
} from '../../../services/projectService';
import { ImportExportMenu } from './ImportExportMenu';
import { ViewModeSelector } from './ViewModeSelector';
import { ThemeStyleSelector } from './ThemeStyleSelector';
import { UiIcon } from './UiIcon';
import { AppLogo } from './AppLogo';
import { PressureCurveEditor } from './PressureCurveEditor';
import { anchorPortalMenu } from '../../../utils/anchorPortalMenu';
import { getDesktopApi } from '../../../services/projectFileFormat';

const TUTORIAL_URL =
  'https://my.feishu.cn/wiki/Af18wmF3niflAnkxZaPcuRs2nCh?from=from_copylink';

async function openTutorial(e?: MouseEvent) {
  e?.preventDefault();
  e?.stopPropagation();
  const desktop = getDesktopApi();
  try {
    if (desktop?.openExternal) {
      await desktop.openExternal(TUTORIAL_URL);
      return;
    }
  } catch (err) {
    console.error('openTutorial desktop failed', err);
  }
  try {
    const w = window.open(TUTORIAL_URL, '_blank', 'noopener,noreferrer');
    if (!w) throw new Error('popup blocked');
  } catch {
    window.prompt('无法自动打开浏览器，请复制链接手动打开：', TUTORIAL_URL);
  }
}

export function Header({
  tablet = false,
  onBackToLibrary,
}: {
  tablet?: boolean;
  onBackToLibrary?: () => void;
}) {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const updateProjectName = useProjectStore((state) => state.updateProjectName);
  const initProject = useProjectStore((state) => state.initProject);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project?.name || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const [showShortcuts, setShowShortcuts] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const swipeStart = useRef<number | null>(null);
  const openMetadataPanel = useUIStore((state) => state.openMetadataPanel);
  const setActiveShot = useUIStore((state) => state.setActiveShot);
  const activeDrawer = useUIStore((state) => state.activeDrawer);
  const openDrawer = useUIStore((state) => state.openDrawer);
  const closeDrawer = useUIStore((state) => state.closeDrawer);

  useEffect(() => {
    if (activeDrawer === 'headerTools' && !menuOpen) setMenuOpen(true);
    if (activeDrawer !== 'headerTools' && menuOpen) setMenuOpen(false);
  }, [activeDrawer]);

  const setHeaderMenuOpen = (open: boolean) => {
    setMenuOpen(open);
    if (open) openDrawer('headerTools');
    else closeDrawer('headerTools');
  };

  useEffect(() => {
    setEditName(project?.name || '');
  }, [project?.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleNameClick = () => {
    if (project) {
      setIsEditing(true);
      setEditName(project.name);
    }
  };

  const handleNameBlur = () => {
    if (project && editName.trim()) {
      updateProjectName(editName.trim());
    } else if (project) {
      setEditName(project.name);
    }
    setIsEditing(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      if (project) {
        setEditName(project.name);
      }
      setIsEditing(false);
    }
  };

  const handleNewProject = async () => {
    if (
      !window.confirm(
        // 使用 i18n 以支持中英文切换
        t('header.newProjectConfirm')
      )
    ) {
      return;
    }
    initProject();
    setActiveShot(null);
  };

  const handleSaveProject = async (saveAs: boolean) => {
    const current = useProjectStore.getState().project;
    if (!current) return;
    try {
      await (saveAs ? exportProjectToLocalFile(current) : saveProjectToBoundFile(current));
    } catch {
      alert(t('header.projectSaveFailed'));
    }
  };

  if (tablet) {
    return (
      <>
        <header className="retro-window m-1 flex items-center gap-1 px-1 h-11 shrink-0 bg-white dark:bg-gray-800">
          <AppLogo title={t('app.title')} className="h-8 w-auto shrink-0" />
          <button
            type="button"
            className="pixel-border-button tablet-icon-btn"
            onClick={() => setHeaderMenuOpen(true)}
            aria-label={t('library.tools')}
            title={t('library.tools')}
          >
            <UiIcon name="menu" />
          </button>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              className="flex-1 min-w-0 text-base font-semibold border-2 border-black dark:border-white bg-white dark:bg-gray-900 px-2 py-0.5 focus:outline-none"
            />
          ) : (
            <button
              type="button"
              className="flex-1 min-w-0 text-left font-bold truncate px-1"
              onClick={handleNameClick}
              title={t('header.editProjectName')}
            >
              {project?.name || t('app.title')}
            </button>
          )}
          <ViewModeSelector compact />
        </header>
        {menuOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[10010] bg-black/40"
              aria-label={t('library.tools')}
              onClick={() => setHeaderMenuOpen(false)}
            />
            <aside
              className="tablet-drawer fixed top-0 bottom-0 left-0 z-[10020] w-[min(300px,84vw)] overflow-y-auto bg-white dark:bg-gray-900 border-r-2 border-black dark:border-white p-3 flex flex-col gap-2"
              onPointerDown={(e) => {
                swipeStart.current = e.clientX;
              }}
              onPointerUp={(e) => {
                if (swipeStart.current != null && swipeStart.current - e.clientX > 48) {
                  setHeaderMenuOpen(false);
                }
                swipeStart.current = null;
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{t('library.tools')}</span>
                <button type="button" className="pixel-border-button tablet-icon-btn" onClick={() => setHeaderMenuOpen(false)}>
                  <UiIcon name="chevron_left" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('library.back')}
                  aria-label={t('library.back')}
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    onBackToLibrary?.();
                  }}
                >
                  <UiIcon name="home" />
                </button>
                <button
                  type="button"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('common.new')}
                  aria-label={t('common.new')}
                  onClick={handleNewProject}
                >
                  <UiIcon name="note_add" />
                </button>
                <button
                  type="button"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('header.saveProject')}
                  aria-label={t('header.saveProject')}
                  onClick={() => void handleSaveProject(false)}
                >
                  <UiIcon name="save" />
                </button>
                <button
                  type="button"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('header.saveProjectAs')}
                  aria-label={t('header.saveProjectAs')}
                  onClick={() => void handleSaveProject(true)}
                >
                  <UiIcon name="folder" />
                </button>
                <button
                  type="button"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('metadata.title')}
                  aria-label={t('metadata.title')}
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    openMetadataPanel();
                  }}
                >
                  <UiIcon name="tune" />
                </button>
                <button
                  type="button"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('header.shortcuts')}
                  aria-label={t('header.shortcuts')}
                  onClick={() => setShowShortcuts(true)}
                >
                  <UiIcon name="keyboard" />
                </button>
                <a
                  href={TUTORIAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pixel-border-button tablet-icon-btn"
                  title={t('header.tutorial')}
                  aria-label={t('header.tutorial')}
                  onClick={openTutorial}
                >
                  <UiIcon name="menu_book" />
                </a>
                <LanguageSelector iconOnly />
                <ThemeStyleSelector iconOnly />
                <SettingsButton iconOnly />
              </div>
              <ImportExportMenu block />
            </aside>
          </>
        )}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      </>
    );
  }

  return (
    <>
    <header className="retro-window m-1 flex items-center justify-between gap-2 p-1 bg-white dark:bg-gray-800 text-lg overflow-x-auto shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <AppLogo title={t('app.title')} className="h-9 w-auto shrink-0" />
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="text-lg font-semibold border-2 border-black dark:border-white bg-white dark:bg-gray-900 px-2 py-1 focus:outline-none"
          />
        ) : (
          <h1
            className="text-2xl font-bold px-2 border-r-2 border-black dark:border-white cursor-pointer"
            onClick={handleNameClick}
            title={t('header.editProjectName')}
          >
            {project?.name || t('app.title')}
          </h1>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onBackToLibrary?.()}
            className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
          >
            {t('library.back')}
          </button>
          <button
            type="button"
            onClick={handleNewProject}
            className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
          >
            {t('common.new')}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveProject(false)}
            className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-1"
            title={t('header.saveProject')}
          >
            <UiIcon name="save" />
            {t('header.saveProject')}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveProject(true)}
            className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
            title={t('header.saveProjectAs')}
          >
            {t('header.saveProjectAs')}
          </button>
          <ImportExportMenu />
        </div>
      </div>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {/* 使用教程、属性、语言、主题、设置 在左；用户区固定在最右上角 */}
        <a
          href={TUTORIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
          title={t('header.tutorial')}
          onClick={openTutorial}
        >
          {t('header.tutorial')}
        </a>
        <button
          onClick={() => openMetadataPanel()}
          className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
          title={t('metadata.title')}
        >
          {t('metadata.title')}
        </button>
        <button
          onClick={() => setShowShortcuts(true)}
          className="pixel-border-button min-h-10 shrink-0 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
          title={t('header.shortcuts')}
        >
          {t('header.shortcuts')}
        </button>
        <LanguageSelector />
        <ThemeStyleSelector />
        <SettingsButton />
      </div>
      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </header>
    </>
  );
}


function LanguageSelector({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t, language } = useTranslation();
  const setLanguage = useUIStore((state) => state.setLanguage);
  const [showMenu, setShowMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0, maxHeight: 200 });

  const languages: { value: Language; label: string; flag: string }[] = [
    { value: 'zh', label: '中文', flag: '🇨🇳' },
    { value: 'en', label: 'English', flag: '🇺🇸' },
  ];

  useEffect(() => {
    if (!showMenu || !buttonRef.current) return;
    const update = () => {
      if (!buttonRef.current) return;
      setMenuPosition(
        anchorPortalMenu(buttonRef.current.getBoundingClientRect(), {
          estimatedHeight: 160,
        })
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [showMenu]);

  const currentLang = languages.find((l) => l.value === language) || languages[0];

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setShowMenu(!showMenu)}
          className={
            iconOnly
              ? 'pixel-border-button tablet-icon-btn'
              : 'pixel-border-button min-h-10 shrink-0 bg-white dark:bg-gray-700 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2 text-sm'
          }
          title={t('header.language')}
          aria-label={t('header.language')}
        >
          <span>{currentLang.flag}</span>
          {!iconOnly && <span>{currentLang.label}</span>}
        </button>
      </div>
      {showMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-[10030]"
            onClick={() => setShowMenu(false)}
          />
          <div
            className="fixed z-[10035] retro-window bg-white dark:bg-gray-900 min-w-[120px] flex flex-col overflow-hidden"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              maxHeight: `${menuPosition.maxHeight}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="retro-header shrink-0">
              <span>{t('header.language')}</span>
              <button
                type="button"
                onClick={() => setShowMenu(false)}
                className="text-white dark:text-black hover:opacity-70"
              >
                ×
              </button>
            </div>
            <div className="p-2 space-y-1 overflow-y-auto overscroll-contain min-h-0">
              {languages.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.value);
                    setShowMenu(false);
                  }}
                  className={`pixel-border-button w-full px-3 py-2 text-left flex items-center gap-2 ${
                    language === lang.value
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                  {language === lang.value && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return createPortal(
    <div
      className="fixed inset-0 z-[10036] flex items-center justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="retro-window bg-white dark:bg-gray-900 w-full max-w-2xl my-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="retro-header">
          <span className="inline-flex items-center gap-2">
            <UiIcon name="keyboard" />
            {t('shortcuts.title')}
          </span>
          <button type="button" onClick={onClose} className="text-white dark:text-black hover:opacity-70">
            ×
          </button>
        </div>
        <div className="p-4 space-y-4 theme-text text-sm">
          <section className="theme-frame p-3">
            <h3 className="font-semibold mb-2 theme-label flex items-center gap-2">
              <UiIcon name="brush" />
              {t('shortcuts.section.drawing')}
            </h3>
            <ul className="space-y-1.5 text-xs md:text-sm theme-muted list-disc pl-5">
              <li>{t('shortcuts.drawing.undo')}</li>
              <li>{t('shortcuts.drawing.brushEraser')}</li>
              <li>{t('shortcuts.drawing.brushSize')}</li>
              <li>{t('shortcuts.drawing.pan')}</li>
              <li>{t('shortcuts.drawing.mouse')}</li>
            </ul>
          </section>
          <section className="theme-frame p-3">
            <h3 className="font-semibold mb-2 theme-label flex items-center gap-2">
              <UiIcon name="touch_app" />
              {t('shortcuts.section.touch')}
            </h3>
            <ul className="space-y-1.5 text-xs md:text-sm theme-muted list-disc pl-5">
              <li>{t('shortcuts.touch.eyedrop')}</li>
              <li>{t('shortcuts.touch.undo')}</li>
              <li>{t('shortcuts.touch.pinch')}</li>
              <li>{t('shortcuts.touch.draw')}</li>
              <li>{t('shortcuts.touch.stylus')}</li>
              <li>{t('shortcuts.touch.panels')}</li>
            </ul>
          </section>
          <section className="theme-frame p-3">
            <h3 className="font-semibold mb-2 theme-label flex items-center gap-2">
              <UiIcon name="view_in_ar" />
              {t('shortcuts.section.pose3d')}
            </h3>
            <ul className="space-y-1.5 text-xs md:text-sm theme-muted list-disc pl-5">
              <li>{t('shortcuts.pose3d.transformModes')}</li>
              <li>{t('shortcuts.pose3d.move')}</li>
              <li>{t('shortcuts.pose3d.rotate')}</li>
              <li>{t('shortcuts.pose3d.mouse')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SettingsButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const { t } = useTranslation();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className={
          iconOnly
            ? 'pixel-border-button tablet-icon-btn'
            : 'pixel-border-button min-h-10 shrink-0 bg-white dark:bg-gray-700 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-center text-sm'
        }
        title={t('header.settings')}
        aria-label={t('header.settings')}
      >
        ⚙️
      </button>
      {showSettings &&
        createPortal(
          <SettingsModal onClose={() => setShowSettings(false)} />,
          document.body
        )}
    </>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const updateProjectAspectRatio = useProjectStore((state) => state.updateProjectAspectRatio);
  const updatePdfHeaderText = useProjectStore((state) => state.updatePdfHeaderText);
  const updatePdfLayout = useProjectStore((state) => state.updatePdfLayout);
  const showSafeFrame = useUIStore((state) => state.showSafeFrame);
  const setShowSafeFrame = useUIStore((state) => state.setShowSafeFrame);
  const maxUndoHistory = useUIStore((state) => state.maxUndoHistory);
  const setMaxUndoHistory = useUIStore((state) => state.setMaxUndoHistory);
  const pressureSizeCurve = useUIStore((state) => state.pressureSizeCurve);
  const setPressureSizeCurve = useUIStore((state) => state.setPressureSizeCurve);
  const [pdfHeaderText, setPdfHeaderText] = useState(project?.pdfHeaderText || t('settings.pdfHeaderText.placeholder'));
  const defaultPdfPage = (() => {
    const ratio = project?.aspectRatio || '16:9';
    const [wStr, hStr] = ratio.split(':');
    const w = parseFloat(wStr || '16');
    const h = parseFloat(hStr || '9');
    const portrait = h > w;
    return {
      columns: project?.pdfColumns || 4,
      rows: project?.pdfRows || 3,
      width: project?.pdfPageWidthMm || (portrait ? 210 : 297),
      height: project?.pdfPageHeightMm || (portrait ? 297 : 210),
    };
  })();
  const [pdfColumns, setPdfColumns] = useState(String(defaultPdfPage.columns));
  const [pdfRows, setPdfRows] = useState(String(defaultPdfPage.rows));
  const [pdfPageWidth, setPdfPageWidth] = useState(String(defaultPdfPage.width));
  const [pdfPageHeight, setPdfPageHeight] = useState(String(defaultPdfPage.height));

  // 同步项目中的 PDF 右上角文本
  useEffect(() => {
    setPdfHeaderText(project?.pdfHeaderText || t('settings.pdfHeaderText.placeholder'));
  }, [project?.pdfHeaderText, t]);

  useEffect(() => {
    setPdfColumns(String(defaultPdfPage.columns));
    setPdfRows(String(defaultPdfPage.rows));
    setPdfPageWidth(String(defaultPdfPage.width));
    setPdfPageHeight(String(defaultPdfPage.height));
  }, [defaultPdfPage.columns, defaultPdfPage.rows, defaultPdfPage.width, defaultPdfPage.height]);

  const commitPdfLayout = (
    next: { columns?: string; rows?: string; width?: string; height?: string } = {}
  ) => {
    updatePdfLayout({
      pdfColumns: Number(next.columns ?? pdfColumns),
      pdfRows: Number(next.rows ?? pdfRows),
      pdfPageWidthMm: Number(next.width ?? pdfPageWidth),
      pdfPageHeightMm: Number(next.height ?? pdfPageHeight),
    });
  };

  const pagePresets = [
    { label: 'A4 297×210', width: 297, height: 210 },
    { label: 'A4 210×297', width: 210, height: 297 },
    { label: 'A3 420×297', width: 420, height: 297 },
    { label: 'A3 297×420', width: 297, height: 420 },
  ];

  const aspectRatios = [
    '16:9',
    '9:16',
    '1:1',
    '4:3',
    '3:2',
    '2.39:1',
    '2.35:1',
    '1.85:1',
  ] as const;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10040]"
      onClick={onClose}
    >
      <div
        className="retro-window bg-white dark:bg-gray-900 p-6 max-w-md w-full mx-4 z-[10050] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="retro-header mb-4">
          <span>{t('header.settings')}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-white dark:text-black hover:opacity-70 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4 theme-text">
          <div>
            <label className="block text-sm font-medium theme-label mb-2">
              {t('settings.aspectRatio')}
            </label>
            <div className="flex flex-wrap gap-2">
              {aspectRatios.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => updateProjectAspectRatio(ratio)}
                  className={`pixel-border-button px-3 py-1.5 text-sm ${
                    project?.aspectRatio === ratio
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t theme-divider">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium theme-label">{t('settings.safeFrame')}</p>
                <p className="text-sm theme-muted mt-1 leading-relaxed">
                  {t('settings.safeFrame.description')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSafeFrame(!showSafeFrame)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  showSafeFrame ? 'bg-blue-600' : 'theme-surface-muted'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    showSafeFrame ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="pt-2 border-t theme-divider">
            <label className="block text-sm font-medium theme-label mb-1" htmlFor="settings-max-undo">
              {t('settings.maxUndo')}
            </label>
            <p className="text-sm theme-muted mb-2 leading-relaxed">
              {t('settings.maxUndo.description')}
            </p>
            <div className="flex items-center gap-3">
              <input
                id="settings-max-undo"
                type="range"
                min={5}
                max={100}
                step={1}
                value={maxUndoHistory}
                onChange={(e) => setMaxUndoHistory(Number(e.target.value))}
                className="flex-1"
              />
              <input
                type="number"
                min={5}
                max={100}
                value={maxUndoHistory}
                onChange={(e) => setMaxUndoHistory(Number(e.target.value) || 20)}
                className="theme-input w-16 h-8 px-2 text-sm text-center"
              />
            </div>
          </div>

          <div className="pt-2 border-t theme-divider">
            <p className="text-sm font-medium theme-label">{t('settings.pressureCurve')}</p>
            <p className="text-sm theme-muted mt-1 mb-2 leading-relaxed">
              {t('settings.pressureCurve.description')}
            </p>
            <div className="flex items-start gap-3">
              <PressureCurveEditor value={pressureSizeCurve} onChange={setPressureSizeCurve} size={168} />
              <div className="text-[10px] theme-muted leading-relaxed pt-1 space-y-1">
                <p>↑ {t('settings.pressureCurve.hintY')}</p>
                <p>→ {t('settings.pressureCurve.hintX')}</p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t theme-divider">
            <label className="block text-sm font-medium theme-label mb-2">
              {t('settings.pdfHeaderText')}
            </label>
            <input
              type="text"
              value={pdfHeaderText}
              onChange={(e) => setPdfHeaderText(e.target.value)}
              onBlur={() => updatePdfHeaderText(pdfHeaderText)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              placeholder={t('settings.pdfHeaderText.placeholder')}
              className="theme-input p-2 text-sm"
            />
            <p className="text-sm theme-muted mt-1 leading-relaxed">
              {t('settings.pdfHeaderText.help')}
            </p>
          </div>

          <div className="pt-2 border-t theme-divider space-y-3">
            <div>
              <p className="text-sm font-medium theme-label">{t('settings.pdfLayout')}</p>
              <p className="text-sm theme-muted mt-1 leading-relaxed">{t('settings.pdfLayout.help')}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm theme-label">
                {t('settings.pdfColumns')}
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={pdfColumns}
                  onChange={(e) => setPdfColumns(e.target.value)}
                  onBlur={() => commitPdfLayout()}
                  className="theme-input mt-2 w-full p-2 text-sm"
                />
              </label>
              <label className="block text-sm theme-label">
                {t('settings.pdfRows')}
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={pdfRows}
                  onChange={(e) => setPdfRows(e.target.value)}
                  onBlur={() => commitPdfLayout()}
                  className="theme-input mt-2 w-full p-2 text-sm"
                />
              </label>
              <label className="block text-sm theme-label">
                {t('settings.pdfPageWidth')}
                <input
                  type="number"
                  min={50}
                  max={2000}
                  value={pdfPageWidth}
                  onChange={(e) => setPdfPageWidth(e.target.value)}
                  onBlur={() => commitPdfLayout()}
                  className="theme-input mt-2 w-full p-2 text-sm"
                />
              </label>
              <label className="block text-sm theme-label">
                {t('settings.pdfPageHeight')}
                <input
                  type="number"
                  min={50}
                  max={2000}
                  value={pdfPageHeight}
                  onChange={(e) => setPdfPageHeight(e.target.value)}
                  onBlur={() => commitPdfLayout()}
                  className="theme-input mt-2 w-full p-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {pagePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="pixel-border-button min-h-10 px-3 py-1 text-sm bg-white dark:bg-gray-900"
                  onClick={() => {
                    setPdfPageWidth(String(preset.width));
                    setPdfPageHeight(String(preset.height));
                    commitPdfLayout({
                      width: String(preset.width),
                      height: String(preset.height),
                    });
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


