import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import { Project } from '../../types';
import { saveProjectToLocal, saveProjectToLocalSync } from '../../services/projectService';
import { useCompactLayout } from '../../hooks/useCompactLayout';
import { useTabletLayout } from '../../hooks/useTabletLayout';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MainWorkspace } from './components/MainWorkspace';
import { MetadataPanel } from './components/MetadataPanel';
import { AttributionBar } from './components/AttributionBar';
import { ProjectLibrary } from './components/ProjectLibrary';
import { UiIcon } from './components/UiIcon';

export function StoryboardEditor() {
  const { t } = useTranslation();
  const isMetadataPanelOpen = useUIStore((state) => state.isMetadataPanelOpen);
  const activeDrawer = useUIStore((state) => state.activeDrawer);
  const openDrawer = useUIStore((state) => state.openDrawer);
  const closeDrawer = useUIStore((state) => state.closeDrawer);
  const compact = useCompactLayout();
  const tablet = useTabletLayout();
  const shotsOpen = activeDrawer === 'shotList';
  const [screen, setScreen] = useState<'library' | 'editor'>(() => {
    try {
      return sessionStorage.getItem('storyboard-screen') === 'editor' ? 'editor' : 'library';
    } catch {
      return 'library';
    }
  });
  const project = useProjectStore((state) => state.project);
  const initProject = useProjectStore((state) => state.initProject);
  const setProjectFromServer = useProjectStore((state) => state.setProjectFromServer);
  const [localWarning, setLocalWarning] = useState<'project_shrunk' | null>(null);
  const shotSwipe = useRef<number | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('storyboard-screen', screen);
    } catch {
      // ignore
    }
  }, [screen]);

  // 读取一次“项目被精简”的标记，在刷新后给出提示
  useEffect(() => {
    try {
      if (localStorage.getItem('web_storyboard_project_shrunk') === '1') {
        setLocalWarning('project_shrunk');
        localStorage.removeItem('web_storyboard_project_shrunk');
      }
    } catch {
      // ignore
    }
  }, []);

  const openProject = (next: Project) => {
    setProjectFromServer(next);
    setScreen('editor');
  };

  const createProject = () => {
    initProject();
    setScreen('editor');
  };

  const backToLibrary = () => {
    const proj = useProjectStore.getState().project;
    closeDrawer('shotList');
    const leave = () => setScreen('library');
    if (!proj) {
      leave();
      return;
    }
    void saveProjectToLocal(proj).catch(() => {}).finally(leave);
  };

  // 自动保存到本机缓存和项目库（防抖 1s，含图片转 base64）
  useEffect(() => {
    if (!project || screen !== 'editor') return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      void saveProjectToLocal(project).catch(() => {});
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project, screen]);

  // 切走或关闭时保存到本机缓存，避免刷新丢失
  useEffect(() => {
    const flushSave = () => {
      const proj = useProjectStore.getState().project;
      if (proj) void saveProjectToLocal(proj).catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushSave();
    };
    const onBeforeUnload = () => {
      const proj = useProjectStore.getState().project;
      if (proj) saveProjectToLocalSync(proj);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  if (screen === 'library') {
    return <ProjectLibrary onOpen={openProject} onCreate={createProject} />;
  }

  const showShotDrawer = tablet || compact;

  return (
    <div className="flex flex-col h-full w-full">
      {localWarning === 'project_shrunk' && (
        <div className="bg-yellow-100 text-yellow-800 text-xs px-3 py-2 flex items-center justify-between border-b border-yellow-300">
          <span>
            本地空间不足，已自动删除部分较早的 AI 生图版本以节省空间；最近的版本仍会被保留。
          </span>
          <button
            type="button"
            className="ml-3 text-yellow-700 hover:text-yellow-900"
            onClick={() => setLocalWarning(null)}
          >
            ×
          </button>
        </div>
      )}
      {/* 顶部工具栏 */}
      <Header tablet={tablet} onBackToLibrary={backToLibrary} />

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {showShotDrawer && !shotsOpen && (
          <button
            type="button"
            onClick={() => openDrawer('shotList')}
            className="absolute left-0 top-1/2 z-20 -translate-y-1/2 h-14 w-7 border-y-2 border-r-2 border-black dark:border-white bg-white dark:bg-gray-800 flex items-center justify-center"
            title={t('sidebar.shotList')}
            aria-label={t('sidebar.shotList')}
          >
            <UiIcon name="chevron_right" />
          </button>
        )}
        {showShotDrawer && shotsOpen && (
          <button
            type="button"
            aria-label={t('sidebar.shotList')}
            className="absolute inset-0 z-20 bg-black/40"
            onClick={() => closeDrawer('shotList')}
          />
        )}
        {(!showShotDrawer || shotsOpen) && (
          <div
            className={
              showShotDrawer
                ? 'tablet-drawer absolute inset-y-0 left-0 z-30 flex shadow-xl bg-white dark:bg-gray-900'
                : 'contents'
            }
            onPointerDown={(e) => {
              shotSwipe.current = e.clientX;
            }}
            onPointerUp={(e) => {
              if (shotSwipe.current != null && shotSwipe.current - e.clientX > 48) {
                closeDrawer('shotList');
              }
              shotSwipe.current = null;
            }}
          >
            <Sidebar onClose={showShotDrawer ? () => closeDrawer('shotList') : undefined} />
          </div>
        )}

        <MainWorkspace />

        {/* 属性面板：与桌面一致用 flex 挤占宽度，避免盖住画布 / 3D / 浮动窗口 */}
        {isMetadataPanelOpen && (
          <div className="shrink-0 flex h-full max-w-[min(20rem,42vw)] border-l-2 border-black dark:border-white bg-white dark:bg-gray-900 overflow-hidden">
            <MetadataPanel />
          </div>
        )}
      </div>

      {/* 署名/来源（保持可见，尽量不影响布局） */}
      {!tablet && <AttributionBar />}
    </div>
  );
}



