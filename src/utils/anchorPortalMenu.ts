/** Position a fixed portal menu near a trigger without overflowing the viewport. */
export function anchorPortalMenu(
  rect: DOMRect,
  opts?: {
    gap?: number;
    margin?: number;
    /** Preferred menu height used to decide flip-up vs open-down. */
    estimatedHeight?: number;
  }
): { top: number; right: number; maxHeight: number } {
  const gap = opts?.gap ?? 8;
  const margin = opts?.margin ?? 8;
  const estimatedHeight = opts?.estimatedHeight ?? 320;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - rect.bottom - gap - margin;
  const spaceAbove = rect.top - gap - margin;
  const openUp = spaceBelow < Math.min(estimatedHeight, 240) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, openUp ? spaceAbove : spaceBelow);
  const usedHeight = Math.min(estimatedHeight, maxHeight);
  const top = openUp
    ? Math.max(margin, rect.top - gap - usedHeight)
    : Math.min(rect.bottom + gap, vh - margin - Math.min(120, maxHeight));
  const right = Math.min(Math.max(margin, vw - rect.right), vw - margin - 120);
  return { top, right, maxHeight };
}
