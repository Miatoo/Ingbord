import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  alignPanelEdges,
  clampPanelPos,
  findFuse,
  getDockForPanel,
  getGroupId,
  getMergeHost,
  getPanelRect,
  isMergeGuest,
  isMergeHost,
  joinPanels,
  registerPanelRect,
  setActiveTab,
  splitGroup,
  splitPanel,
  unregisterPanel,
  type FuseHit,
} from './panelSnap';
import {
  getPanelSlot,
  getPanelTitle,
  getSlotSnapshot,
  setPanelSlot,
  setPanelTitle,
  subscribePanelSlots,
} from './panelSlots';
import { useTranslation } from '../../../i18n/useTranslation';

const DRAG_THRESHOLD = 3;
const EDGE = 6;
const MIN_W = 180;
const MIN_H = 100;
const STORAGE_PREFIX = 'yingge.floatPanel.';
export const FLOAT_MOVE_EVENT = 'yingge-float-pos';
export const FLOAT_SIZE_EVENT = 'yingge-float-size';
export const FLOAT_DOCK_EVENT = 'yingge-float-dock';

export type FloatingPanelPos = { x: number; y: number };

interface FloatingPanelProps {
  id: string;
  title: string;
  children: ReactNode;
  defaultPos: FloatingPanelPos;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  width?: number | string;
  defaultHeight?: number;
  className?: string;
  zIndex?: number;
  onFocus?: () => void;
  showChrome?: boolean;
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  active: boolean;
  /** Cached at drag start — avoid layout reads every move */
  w: number;
  h: number;
  pw: number;
  ph: number;
};

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type ResizeState = {
  pointerId: number;
  edge: ResizeEdge;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
};

type SavedPanel = FloatingPanelPos & { collapsed?: boolean; w?: number; h?: number };

function loadSaved(id: string, fallback: FloatingPanelPos, defaultW: number): SavedPanel {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return { ...fallback, w: defaultW };
    const parsed = JSON.parse(raw) as SavedPanel;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return {
        x: parsed.x,
        y: parsed.y,
        collapsed: parsed.collapsed,
        w: typeof parsed.w === 'number' ? parsed.w : defaultW,
        h: typeof parsed.h === 'number' ? parsed.h : undefined,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...fallback, w: defaultW };
}

function saveState(id: string, pos: FloatingPanelPos, collapsed: boolean, w: number, h: number) {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify({ ...pos, collapsed, w, h }));
  } catch {
    /* ignore */
  }
}

function parentSize(el: HTMLElement | null): { pw: number; ph: number } {
  const parent = el?.offsetParent as HTMLElement | null;
  return {
    pw: parent?.clientWidth || window.innerWidth,
    ph: parent?.clientHeight || window.innerHeight,
  };
}

function broadcastPos(id: string, x: number, y: number) {
  window.dispatchEvent(new CustomEvent(FLOAT_MOVE_EVENT, { detail: { id, x, y } }));
}

function parseDefaultWidth(width?: number | string): number {
  if (typeof width === 'number') return width;
  if (typeof width === 'string') {
    const n = parseInt(width, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 260;
}

const EDGE_CURSOR: Record<ResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
};

function useDockTick() {
  return useSyncExternalStore(subscribePanelSlots, getSlotSnapshot, () => 0);
}

export function FloatingPanel({
  id,
  title,
  children,
  defaultPos,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  width,
  defaultHeight,
  className = '',
  zIndex = 40,
  onFocus,
  showChrome = true,
}: FloatingPanelProps) {
  const { t } = useTranslation();
  const defaultW = parseDefaultWidth(width);
  const saved = useRef(loadSaved(id, defaultPos, defaultW)).current;
  const panelRef = useRef<HTMLDivElement>(null);
  const portalMarkerRef = useRef<HTMLSpanElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<FloatingPanelPos>({ x: saved.x, y: saved.y });
  const [size, setSize] = useState({ w: saved.w ?? defaultW, h: saved.h ?? defaultHeight ?? 0 });
  const [collapsed, setCollapsed] = useState(() => Boolean(saved.collapsed));
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [dockRev, setDockRev] = useState(0);
  const fusePreviewRef = useRef<FuseHit | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const posRef = useRef(pos);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const draggingRef = useRef(false);
  // Never clobber live drag coords with stale React state (was the long-drag jump-back bug)
  if (!dragRef.current?.active) {
    posRef.current = pos;
  }
  useDockTick();

  const bumpDock = useCallback(() => setDockRev((n) => n + 1), []);

  /** Live drag: GPU translate only — zero React updates while pointer is down. */
  const applyDragVisual = useCallback((x: number, y: number, originX: number, originY: number) => {
    posRef.current = { x, y };
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x - originX}px, ${y - originY}px, 0)`;
  }, []);

  const clearDragVisual = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transform = '';
    el.style.willChange = '';
  }, []);

  const setGhost = useCallback((hit: FuseHit | null) => {
    const prev = fusePreviewRef.current;
    if (prev?.otherId === hit?.otherId && Boolean(prev) === Boolean(hit)) return;
    fusePreviewRef.current = hit;
    const g = ghostRef.current;
    if (!g) return;
    if (!hit) {
      g.style.display = 'none';
      return;
    }
    g.style.display = 'flex';
    g.style.left = `${hit.hint.x}px`;
    g.style.top = `${hit.hint.y}px`;
    g.style.width = `${hit.hint.w}px`;
    g.style.height = `${hit.hint.h}px`;
  }, []);

  useEffect(() => {
    setPanelTitle(id, title);
  }, [id, title]);

  const dock = getDockForPanel(id);
  const guest = isMergeGuest(id);
  const host = isMergeHost(id);
  const merged = Boolean(dock && dock.tabs.length > 1);

  // Nested panels (e.g. action library inside poses) must paint into the editor
  // float-root so left/top clamp against the full canvas, not the parent window.
  useLayoutEffect(() => {
    if (guest || !open) {
      setPortalHost(null);
      return;
    }
    const marker = portalMarkerRef.current;
    const root = marker?.closest('[data-float-root]') as HTMLElement | null;
    setPortalHost(root);
  }, [guest, open, id]);

  const publishRect = useCallback(() => {
    // Guests have no own window — only host/solo register for snap
    if (isMergeGuest(id) || !open) {
      unregisterPanel(id);
      return;
    }
    const el = panelRef.current;
    if (!el) {
      unregisterPanel(id);
      return;
    }
    const { pw, ph } = parentSize(el);
    const w = sizeRef.current.w || el.offsetWidth || 120;
    const h = el.offsetHeight || 40;
    registerPanelRect({
      id,
      x: posRef.current.x,
      y: posRef.current.y,
      w,
      h,
      parentW: pw,
      parentH: ph,
    });
  }, [id, open]);

  useEffect(() => {
    if (draggingRef.current) return;
    const el = panelRef.current;
    const h = size.h > 0 ? size.h : el?.offsetHeight || 200;
    if (!guest) saveState(id, pos, collapsed, size.w, h);
  }, [id, pos, collapsed, size, guest]);

  useLayoutEffect(() => {
    publishRect();
    return () => unregisterPanel(id);
  }, [id, pos, size, collapsed, open, publishRect, dockRev, guest]);

  useEffect(() => {
    const onExternal = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; x: number; y: number }>).detail;
      if (!detail || detail.id !== id) return;
      setPos({ x: detail.x, y: detail.y });
    };
    const onSize = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; w: number; h: number }>).detail;
      if (!detail || detail.id !== id) return;
      setSize({ w: detail.w, h: detail.h });
    };
    const onDockChanged = () => bumpDock();
    window.addEventListener(FLOAT_MOVE_EVENT, onExternal);
    window.addEventListener(FLOAT_SIZE_EVENT, onSize);
    window.addEventListener(FLOAT_DOCK_EVENT, onDockChanged);
    return () => {
      window.removeEventListener(FLOAT_MOVE_EVENT, onExternal);
      window.removeEventListener(FLOAT_SIZE_EVENT, onSize);
      window.removeEventListener(FLOAT_DOCK_EVENT, onDockChanged);
    };
  }, [id, bumpDock]);

  const endDrag = useCallback(() => {
    const el = panelRef.current;
    const drag = dragRef.current;
    if (!drag) {
      clearDragVisual();
      return;
    }
    dragRef.current = null;
    draggingRef.current = false;
    headerRef.current?.classList.remove('is-dragging');
    setGhost(null);
    try {
      headerRef.current?.releasePointerCapture(drag.pointerId);
    } catch {
      /* not capturing */
    }
    if (!el || isMergeGuest(id)) {
      clearDragVisual();
      return;
    }
    const { w, h, pw, ph } = drag;

    // Snap only on drop so drag stays 1:1 with the pointer
    const aligned = alignPanelEdges(id, posRef.current.x, posRef.current.y, w, h, pw, ph);
    posRef.current = aligned;
    // Commit left/top before clearing translate to avoid a one-frame flash back to origin
    el.style.left = `${aligned.x}px`;
    el.style.top = `${aligned.y}px`;
    clearDragVisual();
    setPos(aligned);
    registerPanelRect({ id, x: aligned.x, y: aligned.y, w, h, parentW: pw, parentH: ph });

    // Merge only if still overlapping another window after align (edge-nudge ≠ merge)
    const hit = findFuse(id, aligned.x, aligned.y, w, h);
    if (hit && hit.otherId !== id) {
      joinPanels(id, hit.otherId);
      if (getMergeHost(id) === hit.otherId) {
        unregisterPanel(id);
      }
      window.dispatchEvent(new CustomEvent(FLOAT_DOCK_EVENT));
      bumpDock();
    }
    requestAnimationFrame(publishRect);
  }, [id, publishRect, setGhost, bumpDock, clearDragVisual]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const resize = resizeRef.current;
      if (resize && resize.pointerId === e.pointerId) {
        if ((e.buttons & 1) === 0) {
          resizeRef.current = null;
          return;
        }
        const dx = e.clientX - resize.startX;
        const dy = e.clientY - resize.startY;
        let { origX: x, origY: y, origW: w, origH: h } = resize;
        const edge = resize.edge;
        if (edge.includes('e')) w = Math.max(MIN_W, resize.origW + dx);
        if (edge.includes('s')) h = Math.max(MIN_H, resize.origH + dy);
        if (edge.includes('w')) {
          w = Math.max(MIN_W, resize.origW - dx);
          x = resize.origX + (resize.origW - w);
        }
        if (edge.includes('n')) {
          h = Math.max(MIN_H, resize.origH - dy);
          y = resize.origY + (resize.origH - h);
        }
        const el = panelRef.current;
        const { pw, ph } = parentSize(el);
        const clamped = clampPanelPos(x, y, w, h, pw, ph);
        setPos(clamped);
        setSize({ w, h });
        registerPanelRect({
          id,
          x: clamped.x,
          y: clamped.y,
          w,
          h,
          parentW: pw,
          parentH: ph,
        });
        return;
      }

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if ((e.buttons & 1) === 0) {
        endDrag();
        return;
      }
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.active) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.active = true;
        draggingRef.current = true;
        headerRef.current?.classList.add('is-dragging');
        const panel = panelRef.current;
        if (panel) panel.style.willChange = 'transform';
      }
      // Free follow — cached size/parent, no layout reads, no React setState
      const free = clampPanelPos(drag.origX + dx, drag.origY + dy, drag.w, drag.h, drag.pw, drag.ph);
      applyDragVisual(free.x, free.y, drag.origX, drag.origY);
      setGhost(findFuse(id, free.x, free.y, drag.w, drag.h));
      registerPanelRect({
        id,
        x: free.x,
        y: free.y,
        w: drag.w,
        h: drag.h,
        parentW: drag.pw,
        parentH: drag.ph,
      });
    };
    const onUp = (e: PointerEvent) => {
      if (resizeRef.current?.pointerId === e.pointerId) {
        resizeRef.current = null;
        publishRect();
        return;
      }
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      endDrag();
    };
    // Capture phase so we run before other window listeners that stopImmediatePropagation
    window.addEventListener('pointermove', onMove, { passive: true, capture: true });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, [endDrag, id, publishRect, setGhost, applyDragVisual]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, textarea, a')) return;
      e.preventDefault();
      e.stopPropagation();
      onFocus?.();
      const el = panelRef.current;
      const w = sizeRef.current.w || el?.offsetWidth || 120;
      const h = el?.offsetHeight || 40;
      const { pw, ph } = parentSize(el);
      publishRect();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: posRef.current.x,
        origY: posRef.current.y,
        active: false,
        w,
        h,
        pw,
        ph,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [onFocus, publishRect]
  );

  const startResize = (edge: ResizeEdge) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus?.();
    const el = panelRef.current;
    const h = sizeRef.current.h > 0 ? sizeRef.current.h : el?.offsetHeight || 200;
    resizeRef.current = {
      pointerId: e.pointerId,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      origX: posRef.current.x,
      origY: posRef.current.y,
      origW: sizeRef.current.w,
      origH: h,
    };
  };

  const detachAll = useCallback(() => {
    const gid = getGroupId(id);
    if (!gid) return;
    const positions = splitGroup(gid);
    for (const [mid, p] of positions) {
      if (mid === id) setPos(p);
      else broadcastPos(mid, p.x, p.y);
    }
    window.dispatchEvent(new CustomEvent(FLOAT_DOCK_EVENT));
    bumpDock();
  }, [id, bumpDock]);

  // —— Guest: portal body into host tab slot (no own window) ——
  const slotEl = guest ? getPanelSlot(id) : null;
  if (!open) return null;

  if (guest) {
    if (!slotEl) return null;
    return createPortal(
      <div className="floating-panel-body overflow-auto h-full">{children}</div>,
      slotEl
    );
  }

  const heightStyle =
    size.h > 0
      ? { height: collapsed ? undefined : size.h, maxHeight: 'min(85vh, 100%)' }
      : { maxHeight: 'min(85vh, 100%)' };

  const edges: ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const tabs = dock && merged ? dock.tabs : null;
  const activeTab = dock?.activeTab ?? id;

  const panelTree = (
    <>
      {/* Merge preview — DOM-updated during drag (no React re-render) */}
      <div
        ref={ghostRef}
        className="floating-fuse-ghost pointer-events-none absolute rounded-md items-center justify-center"
        style={{ display: 'none', zIndex: zIndex + 20 }}
      >
        <span className="floating-fuse-label text-[11px] font-semibold px-2 py-1 rounded">
          {t('drawing.mergeHint')}
        </span>
      </div>

      <div
        ref={panelRef}
        data-float-panel={id}
        data-docked={merged ? '1' : '0'}
        className={`floating-panel absolute rounded-md border shadow-lg ${merged ? 'is-docked' : ''} ${className}`}
        style={{
          left: pos.x,
          top: pos.y,
          width: size.w,
          zIndex,
          ...heightStyle,
          pointerEvents: 'auto',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onFocus?.();
        }}
      >
        {edges.map((edge) => {
          const style: React.CSSProperties = { position: 'absolute', zIndex: 5, touchAction: 'none' };
          if (edge === 'n') Object.assign(style, { left: EDGE, right: EDGE, top: 0, height: EDGE, cursor: EDGE_CURSOR.n });
          if (edge === 's') Object.assign(style, { left: EDGE, right: EDGE, bottom: 0, height: EDGE, cursor: EDGE_CURSOR.s });
          if (edge === 'e') Object.assign(style, { top: EDGE, bottom: EDGE, right: 0, width: EDGE, cursor: EDGE_CURSOR.e });
          if (edge === 'w') Object.assign(style, { top: EDGE, bottom: EDGE, left: 0, width: EDGE, cursor: EDGE_CURSOR.w });
          if (edge === 'ne') Object.assign(style, { top: 0, right: 0, width: EDGE + 2, height: EDGE + 2, cursor: EDGE_CURSOR.ne });
          if (edge === 'nw') Object.assign(style, { top: 0, left: 0, width: EDGE + 2, height: EDGE + 2, cursor: EDGE_CURSOR.nw });
          if (edge === 'se') Object.assign(style, { bottom: 0, right: 0, width: EDGE + 2, height: EDGE + 2, cursor: EDGE_CURSOR.se });
          if (edge === 'sw') Object.assign(style, { bottom: 0, left: 0, width: EDGE + 2, height: EDGE + 2, cursor: EDGE_CURSOR.sw });
          return (
            <div
              key={edge}
              className="floating-resize-handle"
              style={style}
              onPointerDown={startResize(edge)}
            />
          );
        })}

        {showChrome && (
          <div
            ref={headerRef}
            className="floating-panel-header flex items-center gap-1 px-1.5 py-1 border-b cursor-grab"
            style={{ touchAction: 'none', userSelect: 'none' }}
            onPointerDown={onHeaderPointerDown}
            onLostPointerCapture={() => {
              if (dragRef.current) endDrag();
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0 ml-0.5" style={{ background: 'var(--ui-accent)' }} />

            {tabs ? (
              <div className="floating-merge-tabs flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
                {tabs.map((tid) => {
                  const active = tid === activeTab;
                  return (
                    <button
                      key={tid}
                      type="button"
                      className={`floating-merge-tab shrink-0 px-1.5 h-5 rounded text-[10px] max-w-[7rem] truncate ${
                        active ? 'is-active' : ''
                      }`}
                      title={getPanelTitle(tid)}
                      onClick={(e) => {
                        e.stopPropagation();
                        const gid = getGroupId(id);
                        if (!gid) return;
                        setActiveTab(gid, tid);
                        window.dispatchEvent(new CustomEvent(FLOAT_DOCK_EVENT));
                        bumpDock();
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (tid === id) return;
                        const suggested = splitPanel(tid);
                        if (suggested) broadcastPos(tid, suggested.x, suggested.y);
                        window.dispatchEvent(new CustomEvent(FLOAT_DOCK_EVENT));
                        bumpDock();
                      }}
                    >
                      {getPanelTitle(tid)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-[11px] font-semibold tracking-wide truncate flex-1 opacity-90 px-0.5">
                {title}
              </span>
            )}

            {merged && (
              <button
                type="button"
                className="floating-panel-btn px-1 h-5 rounded text-[9px] shrink-0"
                title={t('drawing.splitPanel')}
                onClick={(e) => {
                  e.stopPropagation();
                  detachAll();
                }}
              >
                {t('drawing.splitPanel')}
              </button>
            )}
            <button
              type="button"
              className="floating-panel-btn w-5 h-5 rounded text-[11px] leading-none shrink-0"
              title={collapsed ? 'Expand' : 'Collapse'}
              onClick={(e) => {
                e.stopPropagation();
                setCollapsed((c) => !c);
              }}
            >
              {collapsed ? '+' : '−'}
            </button>
            <button
              type="button"
              className="floating-panel-btn w-5 h-5 rounded text-[11px] leading-none shrink-0"
              title="Close"
              onClick={(e) => {
                e.stopPropagation();
                if (merged && host) detachAll();
                setOpen(false);
              }}
            >
              ×
            </button>
          </div>
        )}

        {!collapsed && (
          <div
            className="floating-panel-body overflow-hidden"
            style={{
              maxHeight: size.h > 0 ? undefined : 'calc(85vh - 2rem)',
              height: size.h > 0 ? `calc(100% - 2rem)` : undefined,
            }}
          >
            {tabs ? (
              tabs.map((tid) => (
                <div
                  key={tid}
                  className="floating-merge-slot overflow-auto h-full"
                  style={{ display: tid === activeTab ? 'block' : 'none' }}
                  ref={(el) => {
                    if (tid === id) {
                      // Host renders own children directly in its slot
                      return;
                    }
                    setPanelSlot(tid, el);
                  }}
                >
                  {tid === id ? children : null}
                </div>
              ))
            ) : (
              <div className="overflow-auto h-full">{children}</div>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <span ref={portalMarkerRef} aria-hidden className="hidden" />
      {portalHost ? createPortal(panelTree, portalHost) : panelTree}
    </>
  );
}

export function readPanelLocalState(id: string): {
  x: number;
  y: number;
  collapsed: boolean;
  w?: number;
  h?: number;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPanel;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return {
      x: parsed.x,
      y: parsed.y,
      collapsed: Boolean(parsed.collapsed),
      w: parsed.w,
      h: parsed.h,
    };
  } catch {
    return null;
  }
}
