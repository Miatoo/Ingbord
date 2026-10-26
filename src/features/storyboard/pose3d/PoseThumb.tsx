import { useEffect, useState } from 'react';
import {
  getCachedPoseThumb,
  resolvePoseThumb,
  subscribePoseThumbs,
} from './poseThumbService';
import { hashColor, letterFromLabel } from './LibraryThumb';

interface PoseThumbProps {
  poseId: string;
  pose: {
    id?: string;
    name?: string;
    state?: any;
  };
  label: string;
  className?: string;
}

/** Square pose preview: real render when ready, letter tile while loading. */
export function PoseThumb({ poseId, pose, label, className }: PoseThumbProps) {
  const [src, setSrc] = useState<string | null>(() => getCachedPoseThumb(poseId));

  useEffect(() => {
    setSrc(getCachedPoseThumb(poseId));
    const unsub = subscribePoseThumbs((id, url) => {
      if (id === poseId && url) setSrc(url);
    });
    void resolvePoseThumb(pose).then((url) => {
      if (url) setSrc(url);
    });
    return unsub;
    // pose identity is poseId; full pose payload needed only for first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseId]);

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

  const bg = hashColor(poseId || label);
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
