/** Deterministic letter-tile thumbnail for pose/prop library grids (no external images). */

const TILE_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
  '#F97316',
  '#6366F1',
];

export function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return TILE_COLORS[Math.abs(h) % TILE_COLORS.length];
}

export function letterFromLabel(label: string): string {
  const trimmed = (label || '?').trim();
  if (!trimmed) return '?';
  // Prefer first CJK / letter character
  const match = trimmed.match(/[\u4e00-\u9fffA-Za-z0-9]/);
  return (match?.[0] || trimmed[0]).toUpperCase();
}

interface LibraryThumbProps {
  seed: string;
  label: string;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}

export function LibraryThumb({ seed, label, selected, onClick, title }: LibraryThumbProps) {
  const bg = hashColor(seed);
  const letter = letterFromLabel(label);

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className={`flex flex-col items-stretch gap-1 p-1.5 rounded text-left transition-shadow ${
        selected
          ? 'ring-2 ring-primary bg-gray-100 dark:bg-gray-800'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      <div
        className="aspect-square w-full rounded flex items-center justify-center text-white font-bold text-lg select-none border border-black/10 dark:border-white/10"
        style={{ backgroundColor: bg }}
        aria-hidden
      >
        {letter}
      </div>
      <span className="text-[10px] leading-tight line-clamp-2 text-center break-words">
        {label}
      </span>
    </button>
  );
}
