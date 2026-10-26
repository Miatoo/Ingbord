/** DOM slots where merged guest panel bodies portal into the host window. */

const slots = new Map<string, HTMLElement | null>();
const titles = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribePanelSlots(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setPanelSlot(id: string, el: HTMLElement | null) {
  if (slots.get(id) === el) return;
  slots.set(id, el);
  emit();
}

export function getPanelSlot(id: string): HTMLElement | null {
  return slots.get(id) ?? null;
}

export function setPanelTitle(id: string, title: string) {
  if (titles.get(id) === title) return;
  titles.set(id, title);
  emit();
}

export function getPanelTitle(id: string): string {
  return titles.get(id) ?? id;
}

export function getSlotSnapshot(): number {
  // version token for useSyncExternalStore
  return slots.size * 1000 + titles.size + [...slots.values()].filter(Boolean).length;
}
