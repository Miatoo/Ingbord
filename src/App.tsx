import { useEffect } from 'react';
import { useUIStore } from './store/uiStore';
import { StoryboardEditor } from './features/storyboard/StoryboardEditor';
import './App.css';

function App() {
  const themeStyle = useUIStore((state) => state.themeStyle);

  // 仅增删 theme-* class，避免重写 body.className 造成整页闪白
  useEffect(() => {
    const body = document.body;
    const next = `theme-${themeStyle}`;
    const stale: string[] = [];
    body.classList.forEach((cls) => {
      if (cls.startsWith('theme-') && cls !== next) stale.push(cls);
    });
    stale.forEach((cls) => body.classList.remove(cls));
    if (!body.classList.contains(next)) body.classList.add(next);
  }, [themeStyle]);

  const isGlassFullBg =
    themeStyle === 'desert-mirage' ||
    themeStyle === 'cinematic-glass' ||
    themeStyle === 'yingge' ||
    themeStyle === 'sticker-kawaii';

  return (
    <div
      className={`h-full w-full overflow-hidden ${
        themeStyle === 'cinematic-glass' ||
        themeStyle === 'yingge'
          ? 'glass-main flex flex-col shadow-2xl relative'
          : isGlassFullBg
            ? ''
            : 'bg-background-light dark:bg-background-dark grid-bg'
      }`}
    >
      <StoryboardEditor />
    </div>
  );
}

export default App;
