import { useEffect, useState } from 'react';
import {
  getCachedObjectThumb,
  resolveObjectThumb,
  subscribeObjectThumbs,
} from './objectThumbService';
import { hashColor, letterFromLabel } from './LibraryThumb';

interface ObjectThumbProps {
  objectId: string;
  label: string;
  className?: string;
}

/** Square prop preview: model screenshot when ready, letter tile while loading. */
export function ObjectThumb({ objectId, label, className }: ObjectThumbProps) {
  const [src, setSrc] = useState<string | null>(() => getCachedObjectThumb(objectId));

  useEffect(() => {
    setSrc(getCachedObjectThumb(objectId));
    const unsub = subscribeObjectThumbs((id, url) => {
      if (id === objectId && url) setSrc(url);
    });
    void resolveObjectThumb(objectId).then((url) => {
      if (url) setSrc(url);
    });
    return unsub;
  }, [objectId]);

  if (src) {
    return (
      <div
        className={`w-full aspect-square overflow-hidden bg-[#f3f4f6] ${className || ''}`}
        style={{ borderRadius: 0 }}
      >
        <img
          src={src}
          alt={label}
          className="w-full h-full object-contain block"
          style={{ borderRadius: 0 }}
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  const bg = hashColor(objectId || label);
  const letter = letterFromLabel(label);
  return (
    <div
      className={`w-full aspect-square flex items-center justify-center text-white text-lg font-bold ${className || ''}`}
      style={{ background: bg, borderRadius: 0 }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
