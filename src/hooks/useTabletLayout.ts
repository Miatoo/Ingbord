import { useEffect, useState } from 'react';

const QUERY = '(min-width: 600px) and (max-width: 1400px), (pointer: coarse) and (min-width: 600px)';

export function isTabletLayout() {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.classList.contains('native-app')) return true;
  return window.matchMedia(QUERY).matches;
}

/** Tablet / native app: compact chrome, drawers, project library. */
export function useTabletLayout() {
  const [tablet, setTablet] = useState(isTabletLayout);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Debounce: Android file picker / URL bar can briefly flicker matchMedia and remount drawers
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTablet(isTabletLayout()), 120);
    };
    onChange();
    media.addEventListener('change', onChange);
    return () => {
      clearTimeout(timer);
      media.removeEventListener('change', onChange);
    };
  }, []);

  return tablet;
}
