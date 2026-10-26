import { useEffect, useRef, useState } from 'react';
import { Project } from '../../../types';
import {
  deleteSavedProject,
  importProjectFromLocalFile,
  listSavedProjects,
  loadSavedProject,
  openProjectFromDialog,
  SavedProjectCard,
} from '../../../services/projectService';
import { getDesktopApi } from '../../../services/projectFileFormat';
import { useTranslation } from '../../../i18n/useTranslation';
import { ThemeStyleSelector } from './ThemeStyleSelector';
import { UiIcon } from './UiIcon';
import { AppLogo } from './AppLogo';

interface ProjectLibraryProps {
  onOpen: (project: Project) => void;
  onCreate: () => void;
}

export function ProjectLibrary({ onOpen, onCreate }: ProjectLibraryProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<SavedProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = !!getDesktopApi();

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await listSavedProjects());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleOpen = async (id: string) => {
    setOpeningId(id);
    try {
      const project = await loadSavedProject(id);
      if (project) onOpen(project);
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = async (item: SavedProjectCard) => {
    if (!window.confirm(t('library.deleteConfirm').replace('{name}', item.name))) return;
    await deleteSavedProject(item.id);
    setItems((prev) => prev.filter((row) => row.id !== item.id));
  };

  const handleOpenFile = async () => {
    try {
      if (isDesktop) {
        const result = await openProjectFromDialog();
        if (!result) return;
        onOpen(result.project);
        return;
      }
      fileInputRef.current?.click();
    } catch {
      alert(t('library.openFailed'));
    }
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    try {
      const project = await importProjectFromLocalFile(file);
      if (project) onOpen(project);
    } catch {
      alert(t('library.openFailed'));
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto theme-text grid-bg">
      <div className="max-w-5xl mx-auto px-4 py-6 md:px-8">
        <div className="retro-window mb-6 overflow-hidden">
          <div className="retro-header">
            <span>{t('library.title').toUpperCase()}</span>
            <span>×</span>
          </div>
          <div className="p-4 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <AppLogo title={t('app.title')} className="h-12 w-auto shrink-0" />
                <div>
                  <p className="text-lg font-bold leading-tight">{t('app.title')}</p>
                  <h1 className="text-sm theme-muted mt-0.5">{t('library.title')}</h1>
                </div>
              </div>
              <p className="text-sm theme-muted mt-1">{t('library.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <ThemeStyleSelector />
              <button
                type="button"
                onClick={() => void handleOpenFile()}
                className="pixel-border-button h-10 px-4 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-1.5 text-sm"
              >
                <UiIcon name="folder" />
                {t('library.openFile')}
              </button>
              <button
                type="button"
                onClick={onCreate}
                className="pixel-border-button h-10 px-4 bg-black text-white dark:bg-white dark:text-black flex items-center gap-1.5 text-sm"
              >
                <UiIcon name="add" />
                {t('library.new')}
              </button>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".clapboard,.json,application/json,application/x-clapboard-project"
          onChange={(e) => void handleFilePicked(e)}
          className="hidden"
        />

        {loading ? (
          <p className="theme-muted">{t('library.loading')}</p>
        ) : items.length === 0 ? (
          <button
            type="button"
            onClick={onCreate}
            className="retro-window w-full py-16 text-center hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="inline-flex justify-center opacity-50 scale-150">
              <UiIcon name="movie_creation" />
            </span>
            <p className="mt-4 font-semibold">{t('library.empty')}</p>
          </button>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => (
              <article key={item.id} className="retro-window overflow-hidden flex flex-col">
                <button
                  type="button"
                  onClick={() => void handleOpen(item.id)}
                  className="block w-full text-left flex-1"
                  disabled={openingId === item.id}
                >
                  <div className="aspect-video theme-surface-muted relative">
                    {item.cover ? (
                      <img src={item.cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center opacity-40">
                        <span className="scale-150">
                          <UiIcon name="image" />
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h2 className="font-bold truncate">{item.name}</h2>
                    <p className="text-xs theme-muted mt-1">
                      {t('library.shots').replace('{count}', String(item.shotCount))}
                      {' · '}
                      {new Date(item.updatedAt).toLocaleString()}
                    </p>
                    {item.externalPath ? (
                      <p className="text-xs theme-muted mt-1 truncate" title={item.externalPath}>
                        {t('library.linkedFile')}: {item.externalPath}
                      </p>
                    ) : null}
                  </div>
                </button>
                <div className="px-3 pb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    className="pixel-border-button tablet-icon-btn"
                    title={t('library.delete')}
                    aria-label={t('library.delete')}
                  >
                    <UiIcon name="delete" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
