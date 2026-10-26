import { useEffect, useState } from 'react';

const QUERY = '(max-width: 1099px)';

/** True when the window is too narrow for the three-column desktop layout. */
export function useCompactLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false
  );

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setCompact(media.matches), 120);
    };
    onChange();
    media.addEventListener('change', onChange);
    return () => {
      clearTimeout(timer);
      media.removeEventListener('change', onChange);
    };
  }, []);

  return compact;
}
