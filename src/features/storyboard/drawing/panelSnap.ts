import type { FloatingPanelPos } from './FloatingPanel';

/** Magnetic distance for edge align / merge proximity */
const SNAP = 28;
const ALIGN = 14;
const GROUP_STORAGE = 'yingge.floatPanel.docks.v2';
const LAYOUT_STORAGE = 'yingge.floatPanel.layout';

export type PanelRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  parentW?: number;
  parentH?: number;
};

/**
 * Merged dock = ONE window. hostId owns chrome; tabs are panel ids shown as tabs inside.
 */
export type DockGroup = {
  id: string;
  hostId: string;
  tabs: string[];
  activeTab: string;
};

const registry = new Map<string, PanelRect>();
const docks = new Map<string, DockGroup>();
/** panelId → dockId */
const panelDock = new Map<string, string>();

export function registerPanelRect(rect: PanelRect) {
  registry.set(rect.id, rect);
}

export function unregisterPanel(id: string) {
  registry.delete(id);
}

export function getPanelRect(id: string): PanelRect | undefined {
  return registry.get(id);
}

export function getOtherPanels(exceptId: string): PanelRect[] {
  return [...registry.values()].filter((p) => p.id !== exceptId);
}

export function getGroupId(panelId: string): string | null {
  return panelDock.get(panelId) ?? null;
}

export function getGroupMembers(groupId: string): string[] {
  const d = docks.get(groupId);
  if (d?.tabs?.length) return [...d.tabs];
  return [...panelDock.entries()].filter(([, g]) => g === groupId).map(([id]) => id);
}

export function getDock(groupId: string): DockGroup | undefined {
  return docks.get(groupId);
}

export function getDockForPanel(panelId: string): DockGroup | null {
  const gid = panelDock.get(panelId);
  return gid ? docks.get(gid) ?? null : null;
}

export function getMergeHost(panelId: string): string | null {
  return getDockForPanel(panelId)?.hostId ?? null;
}

export function isMergeGuest(panelId: string): boolean {
  const host = getMergeHost(panelId);
  return Boolean(host && host !== panelId);
}

export function isMergeHost(panelId: string): boolean {
  return getMergeHost(panelId) === panelId;
}

function persistDocks() {
  try {
    localStorage.setItem(
      GROUP_STORAGE,
      JSON.stringify({
        docks: [...docks.entries()],
        panelDock: [...panelDock.entries()],
      })
    );
  } catch {
    /* ignore */
  }
}

function normalizeDock(raw: DockGroup & { offsets?: unknown }): DockGroup | null {
  if (!raw || typeof raw.id !== 'string') return null;
  const tabs = Array.isArray(raw.tabs)
    ? raw.tabs.filter((t): t is string => typeof t === 'string')
    : raw.hostId
      ? [raw.hostId]
      : [];
  if (tabs.length === 0) return null;
  const hostId = typeof raw.hostId === 'string' && tabs.includes(raw.hostId) ? raw.hostId : tabs[0];
  const activeTab =
    typeof raw.activeTab === 'string' && tabs.includes(raw.activeTab) ? raw.activeTab : hostId;
  return { id: raw.id, hostId, tabs, activeTab };
}

export function loadGroupsFromStorage() {
  try {
    const raw = localStorage.getItem(GROUP_STORAGE);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      docks?: [string, DockGroup][];
      panelDock?: [string, string][];
    };
    docks.clear();
    panelDock.clear();
    if (Array.isArray(parsed.docks)) {
      for (const [id, g] of parsed.docks) {
        const n = normalizeDock({ ...g, id: g?.id ?? id });
        if (n) {
          docks.set(id, n);
          for (const tid of n.tabs) panelDock.set(tid, id);
        }
      }
    }
    if (Array.isArray(parsed.panelDock)) {
      for (const [pid, gid] of parsed.panelDock) {
        if (docks.has(gid)) panelDock.set(pid, gid);
      }
    }
  } catch {
    /* ignore */
  }
}

loadGroupsFromStorage();

function removeFromDock(panelId: string) {
  const dockId = panelDock.get(panelId);
  if (!dockId) return;
  panelDock.delete(panelId);
  const d = docks.get(dockId);
  if (!d) return;
  d.tabs = d.tabs.filter((t) => t !== panelId);
  if (d.tabs.length <= 1) {
    for (const t of d.tabs) panelDock.delete(t);
    docks.delete(dockId);
  } else {
    if (d.hostId === panelId) d.hostId = d.tabs[0];
    if (!d.tabs.includes(d.activeTab)) d.activeTab = d.hostId;
    docks.set(dockId, { ...d });
  }
  persistDocks();
}

/**
 * Merge guest into host as ONE window (tabs). Target window stays; guest chrome disappears.
 * If guest is already a host, all its tabs move into the target host.
 */
export function joinPanels(guestId: string, hostTargetId: string): string {
  const hostDock = getDockForPanel(hostTargetId);
  const hostId = hostDock?.hostId ?? hostTargetId;
  const dockId = panelDock.get(hostId) ?? `dock-${Date.now()}`;

  const guestDock = getDockForPanel(guestId);
  let incoming: string[];
  if (guestDock && guestDock.hostId === guestId) {
    // Whole window (all tabs) merges into target — dissolve source dock atomically
    incoming = guestDock.tabs.filter((t) => t !== hostId);
    for (const t of guestDock.tabs) panelDock.delete(t);
    docks.delete(guestDock.id);
  } else if (guestId !== hostId) {
    removeFromDock(guestId);
    incoming = [guestId];
  } else {
    incoming = [];
  }

  let d = docks.get(dockId);
  if (!d) {
    d = { id: dockId, hostId, tabs: [hostId], activeTab: hostId };
    panelDock.set(hostId, dockId);
  }

  for (const pid of incoming) {
    if (!d.tabs.includes(pid)) d.tabs.push(pid);
    panelDock.set(pid, dockId);
  }
  const focus = incoming[0];
  if (focus) d.activeTab = focus;
  docks.set(dockId, { ...d });
  persistDocks();
  return dockId;
}

/** Detach one panel from a merged window; returns suggested free position. */
export function splitPanel(panelId: string): FloatingPanelPos | null {
  const d = getDockForPanel(panelId);
  if (!d) return null;
  const hostRect = registry.get(d.hostId);
  const idx = d.tabs.indexOf(panelId);
  removeFromDock(panelId);
  if (!hostRect) return null;
  return {
    x: hostRect.x + 28 + Math.max(0, idx) * 16,
    y: hostRect.y + 28 + Math.max(0, idx) * 16,
  };
}

/** Dissolve entire dock; returns positions for each former member. */
export function splitGroup(groupId: string): Map<string, FloatingPanelPos> {
  const d = docks.get(groupId);
  const out = new Map<string, FloatingPanelPos>();
  if (!d) return out;
  const hostRect = registry.get(d.hostId);
  d.tabs.forEach((tid, i) => {
    panelDock.delete(tid);
    if (hostRect) {
      out.set(tid, { x: hostRect.x + i * 24, y: hostRect.y + i * 24 });
    }
  });
  docks.delete(groupId);
  persistDocks();
  return out;
}

export function setActiveTab(dockId: string, tabId: string) {
  const d = docks.get(dockId);
  if (!d || !d.tabs.includes(tabId)) return;
  d.activeTab = tabId;
  docks.set(dockId, { ...d });
  persistDocks();
}

function clampIn(
  x: number,
  y: number,
  w: number,
  h: number,
  pw: number,
  ph: number
): FloatingPanelPos {
  const minVisible = 48;
  const nx = Math.min(Math.max(-w + minVisible, x), Math.max(0, pw - minVisible));
  const ny = Math.min(Math.max(0, y), Math.max(0, ph - minVisible));
  return { x: nx, y: ny };
}

export type FuseHit = {
  /** Preview overlay = target host window (merge into this) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Host panel id to merge into */
  otherId: string;
  side: 'left' | 'right' | 'top' | 'bottom' | 'overlap';
  hint: { x: number; y: number; w: number; h: number };
};

/**
 * Merge only when dropping ONTO another window (substantial overlap).
 * Edge adjacency alone does NOT merge — that stays as 吸附对齐.
 */
export function findFuse(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number
): FuseHit | null {
  if (isMergeGuest(id)) return null;
  const selfDock = panelDock.get(id);
  let best: FuseHit | null = null;
  let bestScore = Infinity;

  for (const o of getOtherPanels(id)) {
    if (isMergeGuest(o.id)) continue;
    const targetHost = getMergeHost(o.id) ?? o.id;
    if (targetHost === id) continue;
    if (selfDock && panelDock.get(targetHost) === selfDock) continue;

    const hostRect = registry.get(targetHost) ?? o;
    const vOverlap = Math.min(y + h, hostRect.y + hostRect.h) - Math.max(y, hostRect.y);
    const hOverlap = Math.min(x + w, hostRect.x + hostRect.w) - Math.max(x, hostRect.x);
    if (hOverlap <= 0 || vOverlap <= 0) continue;

    // Require covering a good portion of the smaller axis — "drop into" not "nudge beside"
    const coverX = hOverlap / Math.min(w, hostRect.w);
    const coverY = vOverlap / Math.min(h, hostRect.h);
    if (coverX < 0.45 || coverY < 0.45) continue;

    const cx = Math.abs(x + w / 2 - (hostRect.x + hostRect.w / 2));
    const cy = Math.abs(y + h / 2 - (hostRect.y + hostRect.h / 2));
    const score = Math.hypot(cx, cy);
    if (score < bestScore) {
      bestScore = score;
      best = {
        x: hostRect.x,
        y: hostRect.y,
        w: hostRect.w,
        h: hostRect.h,
        otherId: targetHost,
        side: 'overlap',
        hint: { x: hostRect.x, y: hostRect.y, w: hostRect.w, h: hostRect.h },
      };
    }
  }

  return best;
}

/**
 * 吸附对齐：容器四边 + 与其他窗边缘齐平/贴靠（不融合）。
 */
export function alignPanelEdges(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parentW?: number,
  parentH?: number
): FloatingPanelPos {
  const self = registry.get(id);
  const pw = parentW ?? self?.parentW ?? window.innerWidth;
  const ph = parentH ?? self?.parentH ?? window.innerHeight;
  let nx = x;
  let ny = y;

  // Viewport edges
  if (Math.abs(nx) < SNAP) nx = 0;
  if (Math.abs(ny) < SNAP) ny = 0;
  if (Math.abs(nx + w - pw) < SNAP) nx = pw - w;
  if (Math.abs(ny + h - ph) < SNAP) ny = ph - h;

  for (const o of getOtherPanels(id)) {
    if (isMergeGuest(o.id)) continue;

    // Flush against other panel edges (side-by-side / stacked)
    const vOverlap = Math.min(y + h, o.y + o.h) - Math.max(y, o.y);
    const hOverlap = Math.min(x + w, o.x + o.w) - Math.max(x, o.x);

    if (vOverlap > 8) {
      if (Math.abs(nx + w - o.x) < SNAP) nx = o.x - w;
      if (Math.abs(nx - (o.x + o.w)) < SNAP) nx = o.x + o.w;
    }
    if (hOverlap > 8) {
      if (Math.abs(ny + h - o.y) < SNAP) ny = o.y - h;
      if (Math.abs(ny - (o.y + o.h)) < SNAP) ny = o.y + o.h;
    }

    // Align matching edges (left-left, right-right, …)
    if (Math.abs(nx - o.x) < ALIGN) nx = o.x;
    if (Math.abs(nx + w - (o.x + o.w)) < ALIGN) nx = o.x + o.w - w;
    if (Math.abs(ny - o.y) < ALIGN) ny = o.y;
    if (Math.abs(ny + h - (o.y + o.h)) < ALIGN) ny = o.y + o.h - h;
  }

  return clampIn(nx, ny, w, h, pw, ph);
}

export type SnapResult = FloatingPanelPos & { fuse?: FuseHit };

export function snapToPanelsAndEdges(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  parentW?: number,
  parentH?: number,
  opts?: { rigidDock?: boolean; applyFusePos?: boolean }
): SnapResult {
  const self = registry.get(id);
  const pw = parentW ?? self?.parentW ?? window.innerWidth;
  const ph = parentH ?? self?.parentH ?? window.innerHeight;
  let nx = x;
  let ny = y;

  if (Math.abs(nx) < SNAP) nx = 0;
  if (Math.abs(ny) < SNAP) ny = 0;
  if (Math.abs(nx + w - pw) < SNAP) nx = pw - w;
  if (Math.abs(ny + h - ph) < SNAP) ny = ph - h;

  let fuse: FuseHit | undefined;
  if (!opts?.rigidDock) {
    const hit = findFuse(id, nx, ny, w, h);
    if (hit) fuse = hit;
  }

  return { ...clampIn(nx, ny, w, h, pw, ph), fuse };
}

export const UNDOCK_DISTANCE = 48;

export function clampPanelPos(
  x: number,
  y: number,
  w: number,
  h: number,
  parentW?: number,
  parentH?: number
): FloatingPanelPos {
  return clampIn(x, y, w, h, parentW ?? window.innerWidth, parentH ?? window.innerHeight);
}

/** @deprecated Merged windows move as a single host — kept for API compat. */
export function moveDockRigid(
  leaderId: string,
  leaderX: number,
  leaderY: number
): Map<string, FloatingPanelPos> {
  const result = new Map<string, FloatingPanelPos>();
  result.set(leaderId, { x: leaderX, y: leaderY });
  return result;
}

export type SavedLayout = {
  panels: Record<string, { x: number; y: number; collapsed?: boolean; open?: boolean }>;
  groups: Record<string, string>;
};

export function saveFullLayout(
  panels: Record<string, { x: number; y: number; collapsed?: boolean; open?: boolean }>
) {
  const layout: SavedLayout = {
    panels,
    groups: Object.fromEntries(panelDock),
  };
  try {
    localStorage.setItem(LAYOUT_STORAGE, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
  persistDocks();
}

export function loadFullLayout(): SavedLayout | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as SavedLayout;
  } catch {
    return null;
  }
}

export function applyLoadedGroups(groups: Record<string, string>) {
  panelDock.clear();
  docks.clear();
  const byGroup = new Map<string, string[]>();
  for (const [pid, gid] of Object.entries(groups)) {
    const list = byGroup.get(gid) ?? [];
    list.push(pid);
    byGroup.set(gid, list);
  }
  for (const [gid, tabs] of byGroup) {
    if (tabs.length < 2) continue;
    const hostId = tabs[0];
    docks.set(gid, { id: gid, hostId, tabs, activeTab: hostId });
    for (const t of tabs) panelDock.set(t, gid);
  }
  persistDocks();
}
