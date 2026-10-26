import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import { DrawingCanvas, DrawingCanvasRef, type HistoryState } from './DrawingCanvas';
import { DrawingTool, BrushTexture, type BrushTuning, DEFAULT_BRUSH_TUNING } from './DrawingTools';
import { LayerPanel } from './LayerPanel';
import { FloatingPanel, readPanelLocalState } from './FloatingPanel';
import { PaintDock, BrushDetailPanel } from './PaintDock';
import { BrushLibraryPanel } from './BrushLibraryPanel';
import { loadFullLayout, applyLoadedGroups, saveFullLayout } from './panelSnap';
import { useTranslation } from '../../../i18n/useTranslation';
import { useTabletLayout } from '../../../hooks/useTabletLayout';
import type { DrawingLayer, LayerBlendMode } from '../../../types';
import { getBrushPreset, type ArrowStyle } from './brushPresets';
import {
  createCustomBrushFromTip,
  customBrushAsTexture,
  imageFileToPatternDataUrl,
  imageFileToTipDataUrl,
  loadCustomBrushes,
  preloadTipImage,
  tipCanvasToDataUrl,
  USER_MADE_FOLDER_ID,
  USER_MADE_FOLDER_NAME,
  type CustomBrush,
} from './customBrushes';
import { createBrushStamp } from './brushEngine';
import { createDefaultPsBrushSettings, psToLegacyFlat } from './psBrushSettings';
import type { FillEdgeMode } from '../../../utils/drawingLayers';

export function AnnotationEditor() {
  const { t } = useTranslation();
  const activeShotId = useUIStore((state) => state.activeShotId);
  const getShot = useProjectStore((state) => state.getShot);
  const closeAllDrawers = useUIStore((state) => state.closeAllDrawers);
  const openDrawer = useUIStore((state) => state.openDrawer);
  const closeDrawer = useUIStore((state) => state.closeDrawer);
  const [tool, setTool] = useState<DrawingTool>('brush');
  const [lastTool, setLastTool] = useState<DrawingTool>('brush');
  const [foregroundColor, setForegroundColor] = useState('#000000');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [activeColorSlot, setActiveColorSlot] = useState<'fg' | 'bg'>('fg');
  const [fillEdgeMode, setFillEdgeMode] = useState<FillEdgeMode>('match');
  const [fillEdgeWidth, setFillEdgeWidth] = useState(2);
  const maxUndoHistory = useUIStore((s) => s.maxUndoHistory);
  const pressureSizeCurve = useUIStore((s) => s.pressureSizeCurve);
  const [brushSize, setBrushSize] = useState(3);
  const [opacity, setOpacity] = useState(100);
  const [enablePressure, setEnablePressure] = useState(true);
  const [enableOpacityPressure, setEnableOpacityPressure] = useState(false);
  const [smoothness, setSmoothness] = useState(5);
  // Original launch texture was "normal" (solid continuous stroke), not "hard"
  const [brushTexture, setBrushTexture] = useState<BrushTexture>('normal');
  const [brushPresetId, setBrushPresetId] = useState('hard');
  const [brushTuning, setBrushTuning] = useState<BrushTuning>(DEFAULT_BRUSH_TUNING);
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle>('solid');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [layers, setLayers] = useState<DrawingLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState('');
  const tablet = useTabletLayout();
  const [panelsHidden, setPanelsHidden] = useState(false);
  const [paintOpen, setPaintOpen] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(() => !tablet);
  const [layersOpen, setLayersOpen] = useState(true);
  const [panelZ, setPanelZ] = useState({ paint: 50, detail: 49, library: 51, layers: 48 });
  const [tipImage, setTipImage] = useState<HTMLImageElement | null>(null);
  const [dualTipImage, setDualTipImage] = useState<HTMLImageElement | null>(null);
  const [texturePatternImage, setTexturePatternImage] = useState<HTMLImageElement | null>(null);
  const [activeBrushLabel, setActiveBrushLabel] = useState('');
  const canvasRef = useRef<DrawingCanvasRef>(null);
  const floatRootRef = useRef<HTMLDivElement>(null);
  const [layersRightX, setLayersRightX] = useState(400);
  const zCounter = useRef(60);
  const lastCustomBrushRef = useRef<CustomBrush | null>(null);
  const brushApplyGenRef = useRef(0);
  const colorPairRef = useRef({ fg: '#000000', bg: '#ffffff' });
  colorPairRef.current = { fg: foregroundColor, bg: backgroundColor };

  const shot = activeShotId ? getShot(activeShotId) : null;

  useEffect(() => {
    closeAllDrawers();
    if (tablet) openDrawer('annotationRail');
    return () => closeDrawer('annotationRail');
  }, [closeAllDrawers, openDrawer, closeDrawer, tablet]);

  useEffect(() => {
    if (!tablet) return;
    setDetailOpen(false);
  }, [tablet]);

  useLayoutEffect(() => {
    const el = floatRootRef.current;
    if (!el) return;
    const update = () => setLayersRightX(Math.max(12, el.clientWidth - 240));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shot?.id]);

  useEffect(() => {
    const layout = loadFullLayout();
    if (!layout?.panels) return;
    applyLoadedGroups(layout.groups || {});
    const pid = tablet ? 'paint-dock-tablet' : 'paint-dock';
    const did = tablet ? 'brush-detail-tablet' : 'brush-detail';
    const lid = tablet ? 'layers-tablet' : 'layers';
    const lib = tablet ? 'brush-library-tablet' : 'brush-library';
    if (layout.panels[pid]?.open != null) setPaintOpen(Boolean(layout.panels[pid].open));
    if (layout.panels[did]?.open != null) setDetailOpen(Boolean(layout.panels[did].open));
    if (layout.panels[lid]?.open != null) setLayersOpen(Boolean(layout.panels[lid].open));
    if (layout.panels[lib]?.open != null) setLibraryOpen(Boolean(layout.panels[lib].open));
  }, [tablet]);

  const focusPanel = useCallback((key: keyof typeof panelZ) => {
    zCounter.current += 1;
    setPanelZ((prev) => ({ ...prev, [key]: zCounter.current }));
  }, []);

  const applyBuiltinPreset = useCallback(
    (presetId: string) => {
      // Always from code presets — never session-tweaked values
      const preset = getBrushPreset(presetId);
      if (!preset) return;
      brushApplyGenRef.current += 1;
      lastCustomBrushRef.current = null;
      setBrushPresetId(preset.id);
      setBrushTexture(preset.texture);
      setBrushSize(preset.defaultSize);
      setOpacity(preset.defaultOpacity);
      setSmoothness(preset.defaultSmoothness);
      setEnablePressure(preset.pressure);
      setEnableOpacityPressure(preset.opacityPressure > 0);
      setTipImage(null);
      setDualTipImage(null);
      setTexturePatternImage(null);
      setActiveBrushLabel(t(`drawing.brushPreset.${preset.labelKey}` as 'drawing.brushPreset.hard'));
      setBrushTuning({
        ...DEFAULT_BRUSH_TUNING,
        stabilizer: preset.stabilizer,
        sizePressure: preset.sizePressure,
        opacityPressureStrength: preset.opacityPressure,
        taperIn: preset.taperIn,
        taperOut: preset.taperOut,
        minSizeRatio: preset.minSizeRatio,
        density: preset.density ?? DEFAULT_BRUSH_TUNING.density,
        tipSpacing: preset.tipSpacing ?? DEFAULT_BRUSH_TUNING.tipSpacing,
        // Honor preset spacing; auto spacing was skipping too far for small tips (pencil).
        tipSpacingAuto: false,
        scatter: preset.scatter ?? DEFAULT_BRUSH_TUNING.scatter,
        hardness: preset.hardness ?? DEFAULT_BRUSH_TUNING.hardness,
        tipAngle: preset.tipAngle ?? 0,
        watercolorEdge: preset.watercolorEdge ?? false,
        edgeThickness: preset.edgeThickness ?? 6,
        edgeStrength: preset.edgeStrength ?? 18,
        textureStrength:
          preset.texture === 'pencil' ? 0.4 : DEFAULT_BRUSH_TUNING.textureStrength,
        ps: undefined,
      });
      // Do not force-switch tool — eraser can keep using the selected brush tip
    },
    [t]
  );

  /** Apply custom brush by id — always reload stored copy; discard session tweaks. */
  const applyCustomBrushById = useCallback(async (brushId: string) => {
    const stored = loadCustomBrushes().find((b) => b.id === brushId);
    if (!stored) return;
    const brush = structuredClone(stored) as CustomBrush;
    const gen = ++brushApplyGenRef.current;
    lastCustomBrushRef.current = brush;
    setBrushPresetId(brush.id);
    setBrushTexture(customBrushAsTexture(brush));
    setBrushSize(brush.defaultSize);
    setOpacity(brush.defaultOpacity);
    setEnablePressure(brush.pressure);
    // Transfer / opacity: only enable when brush asks for it (avoid forcing pale strokes)
    setEnableOpacityPressure(brush.opacityPressure > 0.3);
    setActiveBrushLabel(brush.name);
    // Drop previous tip immediately so session tip + new settings never mix
    setTipImage(null);
    setDualTipImage(null);
    setTexturePatternImage(null);
    const flat = brush.ps ? psToLegacyFlat(brush.ps) : null;
    const wetOn = Boolean(brush.ps?.misc.wetEdges);
    // When PS settings exist they are the source of truth for stroke params
    setBrushTuning({
      ...DEFAULT_BRUSH_TUNING,
      stabilizer: flat?.stabilizer ?? brush.stabilizer,
      sizePressure: flat?.sizePressure ?? brush.sizePressure,
      opacityPressureStrength: brush.opacityPressure,
      taperIn: brush.taperIn,
      taperOut: brush.taperOut,
      minSizeRatio: flat?.minSizeRatio ?? brush.minSizeRatio,
      density: brush.density,
      tipSpacing: flat?.tipSpacing ?? brush.tipSpacing,
      tipSpacingAuto: false,
      scatter: flat?.scatter ?? brush.scatter,
      hardness: flat?.hardness ?? brush.hardness,
      tipAngle: flat?.tipAngle ?? brush.tipAngle,
      thickness: flat?.thickness ?? brush.thickness ?? DEFAULT_BRUSH_TUNING.thickness,
      directionMode: flat?.directionMode ?? brush.directionMode ?? DEFAULT_BRUSH_TUNING.directionMode,
      highSpeedTexture: false,
      textureStrength: flat?.textureStrength ?? brush.textureStrength ?? 0,
      sizeJitter: flat?.sizeJitter ?? brush.sizeJitter ?? 0,
      angleJitter: flat?.angleJitter ?? brush.angleJitter ?? 0,
      // Wet edges / watercolor only if the brush preset actually has it on
      watercolorEdge: wetOn,
      edgeStrength: wetOn ? DEFAULT_BRUSH_TUNING.edgeStrength : 0,
      ps: brush.ps ? structuredClone(brush.ps) : undefined,
    });
    try {
      const img = await preloadTipImage(brush.id, brush.tipDataUrl);
      if (gen !== brushApplyGenRef.current) return;
      setTipImage(img);
    } catch {
      if (gen !== brushApplyGenRef.current) return;
      setTipImage(null);
    }
    // Only load dual/texture images when that brush actually enables them
    if (brush.dualTipDataUrl && brush.ps?.dualBrush.enabled) {
      try {
        const dual = await preloadTipImage(`${brush.id}-dual`, brush.dualTipDataUrl);
        if (gen !== brushApplyGenRef.current) return;
        setDualTipImage(dual);
      } catch {
        if (gen !== brushApplyGenRef.current) return;
        setDualTipImage(null);
      }
    } else if (gen === brushApplyGenRef.current) {
      setDualTipImage(null);
    }
    const patternUrl = brush.texturePatternDataUrl ?? brush.ps?.texture.patternDataUrl;
    if (patternUrl && brush.ps?.texture.enabled) {
      try {
        const pat = await preloadTipImage(`${brush.id}-tex`, patternUrl);
        if (gen !== brushApplyGenRef.current) return;
        setTexturePatternImage(pat);
      } catch {
        if (gen !== brushApplyGenRef.current) return;
        setTexturePatternImage(null);
      }
    } else if (gen === brushApplyGenRef.current) {
      setTexturePatternImage(null);
    }
  }, []);

  /** Restore factory / stored pack settings — session tweaks are discarded unless saved as 用户自制. */
  const resetBrushToPreset = useCallback(() => {
    const builtin = getBrushPreset(brushPresetId);
    if (builtin) {
      applyBuiltinPreset(builtin.id);
      return;
    }
    void applyCustomBrushById(brushPresetId);
  }, [brushPresetId, applyBuiltinPreset, applyCustomBrushById]);

  /** Any brush id (builtin or custom) → pristine stored/preset data. */
  const selectBrushById = useCallback(
    (id: string) => {
      if (getBrushPreset(id)) {
        applyBuiltinPreset(id);
        return;
      }
      void applyCustomBrushById(id);
    },
    [applyBuiltinPreset, applyCustomBrushById]
  );

  const saveCurrentBrush = useCallback((): CustomBrush | null => {
    const name = window.prompt(
      t('drawing.saveBrushNamePrompt'),
      activeBrushLabel || t('drawing.saveBrushDefaultName')
    );
    if (!name?.trim()) return null;
    let tipDataUrl = '';
    if (tipImage) {
      const c = document.createElement('canvas');
      c.width = tipImage.naturalWidth || tipImage.width || 64;
      c.height = tipImage.naturalHeight || tipImage.height || 64;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(tipImage, 0, 0, c.width, c.height);
        tipDataUrl = tipCanvasToDataUrl(c);
      }
    }
    if (!tipDataUrl) {
      const stamp = createBrushStamp(
        Math.max(16, Math.min(64, brushSize * 4)),
        '#000000',
        brushTuning.hardness,
        brushTuning.thickness
      );
      tipDataUrl = tipCanvasToDataUrl(stamp);
    }
    let dualTipDataUrl: string | undefined;
    if (dualTipImage) {
      const c = document.createElement('canvas');
      c.width = dualTipImage.naturalWidth || dualTipImage.width || 64;
      c.height = dualTipImage.naturalHeight || dualTipImage.height || 64;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(dualTipImage, 0, 0, c.width, c.height);
        dualTipDataUrl = tipCanvasToDataUrl(c);
      }
    }
    let texturePatternDataUrl: string | undefined;
    if (texturePatternImage) {
      const c = document.createElement('canvas');
      c.width = texturePatternImage.naturalWidth || texturePatternImage.width || 64;
      c.height = texturePatternImage.naturalHeight || texturePatternImage.height || 64;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(texturePatternImage, 0, 0, c.width, c.height);
        texturePatternDataUrl = tipCanvasToDataUrl(c);
      }
    }
    const ps = brushTuning.ps
      ? {
          ...structuredClone(brushTuning.ps),
          texture: {
            ...brushTuning.ps.texture,
            patternDataUrl: texturePatternDataUrl ?? brushTuning.ps.texture.patternDataUrl,
            // Keep the brush's own toggle — having an image must not force texture on
            enabled: brushTuning.ps.texture.enabled,
          },
          dualBrush: {
            ...brushTuning.ps.dualBrush,
            enabled: brushTuning.ps.dualBrush.enabled,
          },
        }
      : undefined;
    // Always a new entry under 用户自制 — never overwrite builtin / ABR pack presets
    const brush = createCustomBrushFromTip(name.trim(), tipDataUrl, 'saved', {
      defaultSize: brushSize,
      defaultOpacity: opacity,
      pressure: enablePressure,
      stabilizer: brushTuning.stabilizer,
      sizePressure: brushTuning.sizePressure,
      opacityPressure: brushTuning.opacityPressureStrength,
      taperIn: brushTuning.taperIn,
      taperOut: brushTuning.taperOut,
      minSizeRatio: brushTuning.minSizeRatio,
      density: brushTuning.density,
      tipSpacing: brushTuning.tipSpacing,
      scatter: brushTuning.scatter,
      hardness: brushTuning.hardness,
      tipAngle: brushTuning.tipAngle,
      thickness: brushTuning.thickness,
      directionMode: brushTuning.directionMode,
      highSpeedTexture: brushTuning.highSpeedTexture,
      texture: brushTexture,
      textureStrength: brushTuning.textureStrength,
      tipSpacingAuto: false,
      dualTipDataUrl,
      texturePatternDataUrl,
      ps,
      folderId: USER_MADE_FOLDER_ID,
      folderName: USER_MADE_FOLDER_NAME,
    });
    setBrushPresetId(brush.id);
    setActiveBrushLabel(brush.name);
    return brush;
  }, [
    t,
    activeBrushLabel,
    tipImage,
    dualTipImage,
    texturePatternImage,
    brushSize,
    opacity,
    enablePressure,
    brushTuning,
    brushTexture,
  ]);

  const pickDualTipFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await imageFileToTipDataUrl(file, 256);
      const img = await preloadTipImage(`dual-${Date.now()}`, dataUrl);
      setDualTipImage(img);
      setBrushTuning((prev) => {
        const ps = createDefaultPsBrushSettings(prev.ps);
        ps.dualBrush.enabled = true;
        return { ...prev, ps };
      });
    } catch {
      /* ignore */
    }
  }, []);

  const pickTexturePatternFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await imageFileToPatternDataUrl(file, 256);
      const img = await preloadTipImage(`tex-${Date.now()}`, dataUrl);
      setTexturePatternImage(img);
      setBrushTuning((prev) => {
        const ps = createDefaultPsBrushSettings(prev.ps);
        ps.texture.enabled = true;
        ps.texture.patternDataUrl = dataUrl;
        return {
          ...prev,
          ps,
          textureStrength: Math.max(prev.textureStrength, ps.texture.depthPercent / 100),
        };
      });
    } catch {
      /* ignore */
    }
  }, []);

  const clearDualTip = useCallback(() => {
    setDualTipImage(null);
    setBrushTuning((prev) => {
      if (!prev.ps) return prev;
      const ps = structuredClone(prev.ps);
      ps.dualBrush.enabled = false;
      return { ...prev, ps };
    });
  }, []);

  const clearTexturePattern = useCallback(() => {
    setTexturePatternImage(null);
    setBrushTuning((prev) => {
      if (!prev.ps) return prev;
      const ps = structuredClone(prev.ps);
      ps.texture.patternDataUrl = undefined;
      ps.texture.enabled = false;
      return { ...prev, ps, textureStrength: 0 };
    });
  }, []);

  const handleLayersChange = (next: DrawingLayer[], activeId: string) => {
    setLayers(next);
    setActiveLayerId(activeId);
  };

  const handleHistoryChange = (state: HistoryState | boolean) => {
    if (typeof state === 'boolean') {
      setCanUndo(state);
      return;
    }
    setCanUndo(state.canUndo);
    setCanRedo(state.canRedo);
  };

  const handleToolChange = (next: DrawingTool) => {
    setTool((prev) => {
      if (prev !== next) setLastTool(prev);
      return next;
    });
    if (next !== 'brush' && next !== 'eraser') {
      setDetailOpen(false);
      setLibraryOpen(false);
    }
  };

  const handleBrushTuningChange = (partial: Partial<BrushTuning>) => {
    setBrushTuning((prev) => ({ ...prev, ...partial }));
    const sizePx = partial.ps?.tipShape.sizePx;
    if (typeof sizePx === 'number' && Number.isFinite(sizePx)) {
      setBrushSize(Math.max(1, Math.min(500, sizePx)));
    }
  };

  const handleBrushSizeChange = (size: number) => {
    setBrushSize(size);
    setBrushTuning((prev) => {
      if (!prev.ps) return prev;
      const ps = structuredClone(prev.ps);
      ps.tipShape.sizePx = size;
      return { ...prev, ps };
    });
  };

  const handleOpacityPressureToggle = (enabled: boolean) => {
    setEnableOpacityPressure(enabled);
    if (enabled) {
      // Ensure strength is high enough that 浓淡 is visible through dab overlap
      setBrushTuning((prev) =>
        prev.opacityPressureStrength < 0.55
          ? { ...prev, opacityPressureStrength: 0.85 }
          : prev
      );
    }
  };

  const activeColor = activeColorSlot === 'fg' ? foregroundColor : backgroundColor;
  const setActiveColor = (next: string) => {
    if (activeColorSlot === 'fg') setForegroundColor(next);
    else setBackgroundColor(next);
  };
  const swapColors = () => {
    const { fg, bg } = colorPairRef.current;
    setForegroundColor(bg);
    setBackgroundColor(fg);
  };
  const resetColors = () => {
    setForegroundColor('#000000');
    setBackgroundColor('#ffffff');
    setActiveColorSlot('fg');
  };

  // Default: original solid "normal" round (see DEFAULT_BRUSH_TUNING / hard preset).
  // Do not applyBuiltinPreset('gpen') — opacity-pressure flow crush changes launch feel.
  // Keep independent of `t` so language changes do not reset brush edits.
  useEffect(() => {
    setActiveBrushLabel(t('drawing.brushPreset.hard'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!canUndo) return;
        e.preventDefault();
        canvasRef.current?.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (!canRedo) return;
        e.preventDefault();
        canvasRef.current?.redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const lower = e.key.toLowerCase();
      if (e.key === '\\' || e.key === '`') {
        e.preventDefault();
        setTool((prev) => {
          const swap = lastTool;
          setLastTool(prev);
          return swap;
        });
        return;
      }
      if (lower === 'b') {
        e.preventDefault();
        handleToolChange('brush');
        return;
      }
      if (lower === 'e' || lower === 'r') {
        e.preventDefault();
        handleToolChange('eraser');
        return;
      }
      if (lower === 'i') {
        e.preventDefault();
        handleToolChange('eyedropper');
        return;
      }
      if (lower === 'x') {
        e.preventDefault();
        const { fg, bg } = colorPairRef.current;
        setForegroundColor(bg);
        setBackgroundColor(fg);
        return;
      }
      if (lower === 'd') {
        e.preventDefault();
        setForegroundColor('#000000');
        setBackgroundColor('#ffffff');
        setActiveColorSlot('fg');
        return;
      }
      if (lower === 'g') {
        e.preventDefault();
        handleToolChange('fill');
        return;
      }
      if (lower === 'l') {
        e.preventDefault();
        handleToolChange('lasso');
        return;
      }
      if (lower === 'v') {
        e.preventDefault();
        handleToolChange('select');
        return;
      }
      if (lower === 't') {
        e.preventDefault();
        handleToolChange('text');
        return;
      }
      if (lower === 'u') {
        e.preventDefault();
        handleToolChange('rect');
        return;
      }
      if (lower === 'o') {
        e.preventDefault();
        handleToolChange('ellipse');
        return;
      }
      if (lower === 'n') {
        e.preventDefault();
        handleToolChange('line');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setPanelsHidden((h) => !h);
        return;
      }
      if (e.key === '[') {
        e.preventDefault();
        setBrushSize((prev) => Math.max(1, prev - 1));
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        setBrushSize((prev) => Math.min(80, prev + 1));
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, lastTool]);

  if (!shot) {
    return (
      <div className="retro-window flex-1 flex flex-col items-center justify-center text-gray-400 bg-white dark:bg-gray-900">
        <div className="retro-header">
          <span>ANNOTATION_EDITOR</span>
        </div>
        <div className="p-4">{t('metadata.selectShot')}</div>
      </div>
    );
  }

  const layerPanel = (
    <LayerPanel
      layers={layers}
      activeLayerId={activeLayerId}
      onSelect={(id) => canvasRef.current?.selectLayer(id)}
      onToggleVisible={(id) => canvasRef.current?.toggleLayerVisible(id)}
      onAdd={() => canvasRef.current?.addLayer()}
      onDelete={(id) => canvasRef.current?.deleteLayer(id)}
      onReorder={(ids) => canvasRef.current?.reorderLayers(ids)}
      onOpacityChange={(id, next) => canvasRef.current?.setLayerOpacity(id, next)}
      onBlendModeChange={(id, mode: LayerBlendMode) => canvasRef.current?.setLayerBlendMode(id, mode)}
    />
  );

  const canvasProps = {
    ref: canvasRef,
    shotId: shot.id,
    tool,
    color: foregroundColor,
    brushSize,
    opacity,
    enablePressure,
    enableOpacityPressure,
    smoothness,
    brushTexture,
    arrowStyle,
    stabilizer: brushTuning.stabilizer,
    sizePressure: brushTuning.sizePressure,
    opacityPressureStrength: brushTuning.opacityPressureStrength,
    taperIn: brushTuning.taperIn,
    taperOut: brushTuning.taperOut,
    minSizeRatio: brushTuning.minSizeRatio,
    density: brushTuning.density,
    tipSpacing: brushTuning.tipSpacing,
    scatter: brushTuning.scatter,
    hardness: brushTuning.hardness,
    tipAngle: brushTuning.tipAngle,
    speedTaper: brushTuning.speedTaper,
    watercolorEdge: brushTuning.watercolorEdge,
    edgeThickness: brushTuning.edgeThickness,
    edgeStrength: brushTuning.edgeStrength,
    edgeDarkness: brushTuning.edgeDarkness,
    edgeBlur: brushTuning.edgeBlur,
    flow: brushTuning.flow,
    thickness: brushTuning.thickness,
    sizeJitter: Math.max(brushTuning.sizeJitter, brushTuning.shapeVariation),
    angleJitter: brushTuning.angleJitter,
    densityJitter: brushTuning.densityJitter,
    tipSpacingAuto: brushTuning.tipSpacingAuto,
    tipImage,
    dualTipImage,
    texturePatternImage,
    psBrush: brushTuning.ps,
    directionMode: brushTuning.directionMode,
    binarize: brushTuning.binarize,
    blendMode: brushTuning.blendMode,
    ribbon: brushTuning.ribbon,
    ribbonCycle: brushTuning.ribbonCycle,
    alternateSides: brushTuning.alternateSides,
    verticalThickness: brushTuning.verticalThickness,
    tipFoilComposite: brushTuning.tipFoilComposite,
    highSpeedTexture: brushTuning.highSpeedTexture,
    textureStrength: brushTuning.textureStrength,
    shapeVariation: brushTuning.shapeVariation,
    backgroundColor,
    fillEdgeMode,
    fillEdgeWidth,
    maxHistory: maxUndoHistory,
    pressureSizeCurve,
    onHistoryChange: handleHistoryChange,
    onLayersChange: handleLayersChange,
    onColorSampled: setActiveColor,
  };

  const paintId = tablet ? 'paint-dock-tablet' : 'paint-dock';
  const detailId = tablet ? 'brush-detail-tablet' : 'brush-detail';
  const libraryId = tablet ? 'brush-library-tablet' : 'brush-library';
  const layersId = tablet ? 'layers-tablet' : 'layers';

  const handleSaveLayout = () => {
    const panels: Record<string, { x: number; y: number; collapsed?: boolean; open?: boolean }> = {};
    const openMap: Record<string, boolean> = {
      [paintId]: paintOpen,
      [detailId]: detailOpen,
      [libraryId]: libraryOpen,
      [layersId]: layersOpen,
    };
    for (const id of [paintId, detailId, libraryId, layersId]) {
      const st = readPanelLocalState(id);
      if (st) {
        panels[id] = { ...st, open: openMap[id] };
      }
    }
    saveFullLayout(panels);
    window.alert(t('drawing.layoutSaved'));
  };

  return (
    <div
      ref={floatRootRef}
      className="flex-1 relative min-h-0 bg-gray-100 dark:bg-gray-800 overflow-hidden"
      data-float-root
    >
      <DrawingCanvas {...canvasProps} />

      {panelsHidden ? (
        <button
          type="button"
          className="absolute left-2 top-2 z-[80] px-2 py-1 text-xs rounded pixel-border-button"
          onClick={() => setPanelsHidden(false)}
        >
          {t('drawing.showPanels')}
        </button>
      ) : (
        <div
          className="absolute right-2 top-2 z-[80] flex flex-wrap gap-1 max-w-[55%]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!paintOpen && (
            <button
              type="button"
              className="px-2 py-1 text-xs rounded pixel-border-button"
              onClick={() => setPaintOpen(true)}
            >
              {t('drawing.tools')}
            </button>
          )}
          {!detailOpen && (
            <button
              type="button"
              className="px-2 py-1 text-xs rounded pixel-border-button"
              onClick={() => setDetailOpen(true)}
            >
              {t('drawing.brushDetail')}
            </button>
          )}
          {!libraryOpen && (
            <button
              type="button"
              className="px-2 py-1 text-xs rounded pixel-border-button"
              onClick={() => {
                setLibraryOpen(true);
                focusPanel('library');
              }}
            >
              {t('drawing.brushLibrary')}
            </button>
          )}
          {!layersOpen && (
            <button
              type="button"
              className="px-2 py-1 text-xs rounded pixel-border-button"
              onClick={() => setLayersOpen(true)}
            >
              {t('drawing.layers')}
            </button>
          )}
          <button
            type="button"
            className="px-2 py-1 text-xs rounded pixel-border-button"
            onClick={handleSaveLayout}
          >
            {t('drawing.saveLayout')}
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded pixel-border-button"
            onClick={() => setPanelsHidden(true)}
          >
            {t('drawing.hidePanels')}
          </button>
        </div>
      )}

      {!panelsHidden && (
        <>
          <FloatingPanel
            id={paintId}
            title={t('drawing.paintDock')}
            defaultPos={{ x: tablet ? 8 : 12, y: tablet ? 48 : 52 }}
            open={paintOpen}
            onOpenChange={setPaintOpen}
            zIndex={panelZ.paint}
            onFocus={() => focusPanel('paint')}
            width={268}
          >
            <PaintDock
              currentTool={tool}
              onToolChange={handleToolChange}
              currentColor={activeColor}
              onColorChange={setActiveColor}
              foregroundColor={foregroundColor}
              backgroundColor={backgroundColor}
              activeColorSlot={activeColorSlot}
              onActiveColorSlotChange={setActiveColorSlot}
              onSwapColors={swapColors}
              onResetColors={resetColors}
              currentBrushSize={brushSize}
              onBrushSizeChange={handleBrushSizeChange}
              currentOpacity={opacity}
              onOpacityChange={setOpacity}
              enablePressure={enablePressure}
              onPressureToggle={setEnablePressure}
              enableOpacityPressure={enableOpacityPressure}
              onOpacityPressureToggle={handleOpacityPressureToggle}
              brushPresetId={brushPresetId}
              onBrushPresetChange={selectBrushById}
              brushTexture={brushTexture}
              onBrushTextureChange={setBrushTexture}
              brushTuning={brushTuning}
              onBrushTuningChange={handleBrushTuningChange}
              arrowStyle={arrowStyle}
              onArrowStyleChange={setArrowStyle}
              fillEdgeMode={fillEdgeMode}
              onFillEdgeModeChange={setFillEdgeMode}
              fillEdgeWidth={fillEdgeWidth}
              onFillEdgeWidthChange={setFillEdgeWidth}
              onUndo={() => canvasRef.current?.undo()}
              onRedo={() => canvasRef.current?.redo()}
              canUndo={canUndo}
              canRedo={canRedo}
              onFitToScreen={() => canvasRef.current?.fitToScreen()}
              onClearSelection={() => canvasRef.current?.clearSelection()}
              detailOpen={detailOpen}
              onOpenDetail={() => {
                setDetailOpen(true);
                focusPanel('detail');
              }}
              libraryOpen={libraryOpen}
              onOpenLibrary={() => {
                setLibraryOpen(true);
                focusPanel('library');
              }}
              activeBrushLabel={activeBrushLabel}
            />
          </FloatingPanel>

          <FloatingPanel
            id={libraryId}
            title={t('drawing.brushLibrary')}
            defaultPos={{ x: tablet ? 8 : 12, y: tablet ? 320 : 360 }}
            open={libraryOpen}
            onOpenChange={setLibraryOpen}
            zIndex={panelZ.library}
            onFocus={() => focusPanel('library')}
            width={256}
          >
            <BrushLibraryPanel
              selectedId={brushPresetId}
              onSelectBuiltin={applyBuiltinPreset}
              onSelectCustom={(id) => {
                void applyCustomBrushById(id);
              }}
              onSaveCurrentBrush={saveCurrentBrush}
              onExportCurrentBrush={saveCurrentBrush}
            />
          </FloatingPanel>

          <FloatingPanel
            id={detailId}
            title={t('drawing.brushDetail')}
            defaultPos={{ x: tablet ? 8 : 290, y: tablet ? 48 : 52 }}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            zIndex={panelZ.detail}
            onFocus={() => focusPanel('detail')}
            width={276}
          >
            <BrushDetailPanel
              brushTuning={brushTuning}
              onBrushTuningChange={handleBrushTuningChange}
              currentBrushSize={brushSize}
              brushTexture={brushTexture}
              onBrushTextureChange={setBrushTexture}
              dualTipPreviewUrl={dualTipImage?.src}
              texturePatternPreviewUrl={texturePatternImage?.src}
              onDualTipImageFile={(f) => {
                void pickDualTipFile(f);
              }}
              onTexturePatternFile={(f) => {
                void pickTexturePatternFile(f);
              }}
              onClearDualTip={clearDualTip}
              onClearTexturePattern={clearTexturePattern}
              onResetToPreset={resetBrushToPreset}
            />
          </FloatingPanel>

          <FloatingPanel
            id={layersId}
            title={t('drawing.layers')}
            defaultPos={{
              x: layersRightX,
              y: tablet ? 48 : 52,
            }}
            open={layersOpen}
            onOpenChange={setLayersOpen}
            width={228}
            zIndex={panelZ.layers}
            onFocus={() => focusPanel('layers')}
          >
            <div className="p-1 max-h-[60vh] overflow-auto theme-surface-muted theme-text">
              {layerPanel}
            </div>
          </FloatingPanel>
        </>
      )}
    </div>
  );
}
