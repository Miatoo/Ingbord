import { create } from 'zustand';
import { ViewMode } from '../types';
import {
  DEFAULT_PRESSURE_SIZE_CURVE,
  normalizePressureCurve,
  type PressureCurvePoint,
} from '../utils/pressureCurve';

export type { PressureCurvePoint };

export type ThemeStyle =
  | 'retro-pixel'
  | 'modern'
  | 'classic'
  | 'retro-story'
  | 'desert-mirage'
  | 'cinematic-glass'
  | 'sticker-kawaii'
  | 'night-black'
  | 'yingge';
export type Language = 'zh' | 'en';

/** Exclusive overlay drawer on tablet/phone — only one open at a time */
export type AppDrawer = 'none' | 'shotList' | 'metadata' | 'headerTools' | 'poseControls' | 'annotationRail';

interface UIStore {
  activeShotId: string | null;
  viewMode: ViewMode;
  isMetadataPanelOpen: boolean;
  showSafeFrame: boolean;
  /** Max undo steps for annotation canvas (persisted). */
  maxUndoHistory: number;
  /** Pen pressure → brush size response curve. */
  pressureSizeCurve: PressureCurvePoint[];
  themeStyle: ThemeStyle;
  language: Language;
  activeDrawer: AppDrawer;

  setActiveShot: (shotId: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleMetadataPanel: () => void;
  openMetadataPanel: () => void;
  closeMetadataPanel: () => void;
  setShowSafeFrame: (value: boolean) => void;
  setMaxUndoHistory: (value: number) => void;
  setPressureSizeCurve: (points: PressureCurvePoint[]) => void;
  setThemeStyle: (style: ThemeStyle) => void;
  setLanguage: (lang: Language) => void;
  setActiveDrawer: (drawer: AppDrawer) => void;
  openDrawer: (drawer: Exclude<AppDrawer, 'none'>) => void;
  closeDrawer: (drawer?: AppDrawer) => void;
  closeAllDrawers: () => void;
}

const loadThemeStyle = (): ThemeStyle => {
  const saved = localStorage.getItem('themeStyle');
  if (
    saved &&
    [
      'retro-pixel',
      'modern',
      'classic',
      'retro-story',
      'desert-mirage',
      'cinematic-glass',
      'sticker-kawaii',
      'night-black',
      'yingge',
    ].includes(saved)
  ) {
    return saved as ThemeStyle;
  }
  return 'retro-pixel';
};

const loadLanguage = (): Language => {
  const saved = localStorage.getItem('language');
  if (saved && (saved === 'zh' || saved === 'en')) {
    return saved as Language;
  }
  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith('zh') ? 'zh' : 'en';
};

const loadViewMode = (): ViewMode => {
  const saved = localStorage.getItem('viewMode') as ViewMode | null;
  if (saved && ['board', 'pose3d', 'annotation', 'aigenerate'].includes(saved)) {
    return saved;
  }
  return 'board';
};

const loadActiveShotId = (): string | null => {
  const saved = localStorage.getItem('activeShotId');
  return saved || null;
};

const loadMetadataPanelOpen = (): boolean => {
  const saved = localStorage.getItem('isMetadataPanelOpen');
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return true;
};

const clampMaxUndoHistory = (n: number) => Math.max(5, Math.min(100, Math.round(n)));

const loadMaxUndoHistory = (): number => {
  const saved = localStorage.getItem('maxUndoHistory');
  if (saved == null) return 20;
  const n = Number(saved);
  if (!Number.isFinite(n)) return 20;
  return clampMaxUndoHistory(n);
};

const loadPressureSizeCurve = (): PressureCurvePoint[] => {
  try {
    const raw = localStorage.getItem('pressureSizeCurve');
    if (!raw) return DEFAULT_PRESSURE_SIZE_CURVE.map((p) => ({ ...p }));
    const parsed = JSON.parse(raw) as PressureCurvePoint[];
    if (!Array.isArray(parsed) || parsed.length < 2) {
      return DEFAULT_PRESSURE_SIZE_CURVE.map((p) => ({ ...p }));
    }
    return normalizePressureCurve(parsed);
  } catch {
    return DEFAULT_PRESSURE_SIZE_CURVE.map((p) => ({ ...p }));
  }
};

export const useUIStore = create<UIStore>((set, get) => ({
  activeShotId: loadActiveShotId(),
  viewMode: loadViewMode(),
  isMetadataPanelOpen: loadMetadataPanelOpen(),
  showSafeFrame: true,
  maxUndoHistory: loadMaxUndoHistory(),
  pressureSizeCurve: loadPressureSizeCurve(),
  themeStyle: loadThemeStyle(),
  language: loadLanguage(),
  activeDrawer: 'none',

  setActiveShot: (shotId) => {
    if (shotId) {
      localStorage.setItem('activeShotId', shotId);
    } else {
      localStorage.removeItem('activeShotId');
    }
    set({ activeShotId: shotId });
  },

  setViewMode: (mode) => {
    localStorage.setItem('viewMode', mode);
    set({ viewMode: mode, activeDrawer: 'none' });
  },

  toggleMetadataPanel: () =>
    set((state) => {
      const next = !state.isMetadataPanelOpen;
      localStorage.setItem('isMetadataPanelOpen', String(next));
      return {
        isMetadataPanelOpen: next,
        activeDrawer: next ? 'metadata' : state.activeDrawer === 'metadata' ? 'none' : state.activeDrawer,
      };
    }),

  openMetadataPanel: () => {
    localStorage.setItem('isMetadataPanelOpen', 'true');
    set({ isMetadataPanelOpen: true, activeDrawer: 'metadata' });
  },

  closeMetadataPanel: () => {
    localStorage.setItem('isMetadataPanelOpen', 'false');
    set((state) => ({
      isMetadataPanelOpen: false,
      activeDrawer: state.activeDrawer === 'metadata' ? 'none' : state.activeDrawer,
    }));
  },

  setShowSafeFrame: (value) => set({ showSafeFrame: value }),

  setMaxUndoHistory: (value) => {
    const next = clampMaxUndoHistory(value);
    localStorage.setItem('maxUndoHistory', String(next));
    set({ maxUndoHistory: next });
  },

  setPressureSizeCurve: (points) => {
    const next = normalizePressureCurve(points);
    localStorage.setItem('pressureSizeCurve', JSON.stringify(next));
    set({ pressureSizeCurve: next });
  },

  setThemeStyle: (style) => {
    localStorage.setItem('themeStyle', style);
    set({ themeStyle: style });
    // Body class 由 App 的 effect 统一增删，避免双重重写 className 闪屏
  },

  setLanguage: (lang) => {
    localStorage.setItem('language', lang);
    set({ language: lang });
  },

  setActiveDrawer: (drawer) => set({ activeDrawer: drawer }),

  openDrawer: (drawer) => {
    const updates: Partial<UIStore> = { activeDrawer: drawer };
    if (drawer === 'metadata') {
      localStorage.setItem('isMetadataPanelOpen', 'true');
      updates.isMetadataPanelOpen = true;
    } else if (get().isMetadataPanelOpen) {
      // Exclusive: any other drawer closes the metadata panel
      localStorage.setItem('isMetadataPanelOpen', 'false');
      updates.isMetadataPanelOpen = false;
    }
    set(updates);
  },

  closeDrawer: (drawer) => {
    const current = get().activeDrawer;
    if (drawer && current !== drawer) return;
    if (current === 'metadata' || drawer === 'metadata') {
      localStorage.setItem('isMetadataPanelOpen', 'false');
      set({ activeDrawer: 'none', isMetadataPanelOpen: false });
      return;
    }
    set({ activeDrawer: 'none' });
  },

  closeAllDrawers: () => {
    localStorage.setItem('isMetadataPanelOpen', 'false');
    set({ activeDrawer: 'none', isMetadataPanelOpen: false });
  },
}));
