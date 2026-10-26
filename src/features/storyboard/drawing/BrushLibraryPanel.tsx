import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../../i18n/useTranslation';
import { BRUSH_PRESETS } from './brushPresets';
import {
  createAbrFolderId,
  createCustomBrushFromTip,
  groupBrushesByFolder,
  imageFileToTipDataUrl,
  loadCustomBrushes,
  saveCustomBrushes,
  USER_MADE_FOLDER_ID,
  USER_MADE_FOLDER_NAME,
  type BrushFolder,
  type CustomBrush,
} from './customBrushes';
import { abrTipToDataUrl, parseAbrPresets } from './abrImport';
import { psToLegacyFlat } from './psBrushSettings';
import { downloadBrushJson, parseBrushJsonFile } from './brushExport';

export type BrushLibrarySelection = {
  id: string;
  kind: 'builtin' | 'custom';
};

interface BrushLibraryPanelProps {
  selectedId: string;
  onSelectBuiltin: (presetId: string) => void;
  /** Select by id — parent reloads pristine stored data (not session tweaks). */
  onSelectCustom: (brushId: string) => void;
  onCustomListChange?: (list: CustomBrush[]) => void;
  /** Persist current editor brush settings as a named custom brush (用户自制). */
  onSaveCurrentBrush?: () => CustomBrush | null;
  /** Build current brush for export (may prompt for name). */
  onExportCurrentBrush?: () => CustomBrush | null;
}

export function BrushLibraryPanel({
  selectedId,
  onSelectBuiltin,
  onSelectCustom,
  onCustomListChange,
  onSaveCurrentBrush,
  onExportCurrentBrush,
}: BrushLibraryPanelProps) {
  const { t } = useTranslation();
  const [customs, setCustoms] = useState<CustomBrush[]>(() => loadCustomBrushes());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const imgInputRef = useRef<HTMLInputElement>(null);
  const abrInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const folders = useMemo(() => groupBrushesByFolder(customs), [customs]);

  const persist = (next: CustomBrush[]) => {
    setCustoms(next);
    saveCustomBrushes(next);
    onCustomListChange?.(next);
  };

  const toggleFolder = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const importImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(t('drawing.importingBrushes'));
    try {
      const added: CustomBrush[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const tip = await imageFileToTipDataUrl(file);
        const name = file.name.replace(/\.[^.]+$/, '') || t('drawing.customBrush');
        added.push(
          createCustomBrushFromTip(name, tip, 'image', {
            scatter: 0,
            tipSpacingAuto: false,
            texture: 'normal',
            folderId: USER_MADE_FOLDER_ID,
            folderName: USER_MADE_FOLDER_NAME,
          })
        );
      }
      if (!added.length) throw new Error('no image');
      persist([...customs, ...added]);
      onSelectCustom(added[0].id);
    } catch {
      setError(t('drawing.importBrushFail'));
    } finally {
      setBusy(null);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  const importAbr = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(t('drawing.importingAbr'));
    try {
      const added: CustomBrush[] = [];
      for (const file of Array.from(files)) {
        const presets = await parseAbrPresets(file);
        const base = file.name.replace(/\.[^.]+$/, '') || 'brush';
        // One ABR file = one folder; delete folder removes the whole pack
        const folderId = createAbrFolderId(base);
        const folderName = base;
        presets.forEach((preset, i) => {
          const dataUrl = abrTipToDataUrl(preset.tip, 512);
          const dualTipDataUrl = preset.dualTip ? abrTipToDataUrl(preset.dualTip, 512) : undefined;
          const texturePatternDataUrl = preset.pattern
            ? abrTipToDataUrl(preset.pattern, 256)
            : undefined;
          const name =
            preset.name?.trim() || (presets.length > 1 ? `${base} ${i + 1}` : base);

          const ps = preset.ps
            ? {
                ...preset.ps,
                tipShape: {
                  ...preset.ps.tipShape,
                  sizePx:
                    preset.sizePx ??
                    preset.ps.tipShape.sizePx ??
                    Math.max(preset.tip.width, preset.tip.height),
                  spacingPercent: preset.spacingPercent || preset.ps.tipShape.spacingPercent,
                  angleDeg: preset.tipAngleDeg ?? preset.ps.tipShape.angleDeg,
                  roundnessPercent:
                    preset.roundnessPercent ?? preset.ps.tipShape.roundnessPercent,
                  hardnessPercent:
                    preset.hardnessPercent ?? preset.ps.tipShape.hardnessPercent,
                  flipX: preset.flipX ?? preset.ps.tipShape.flipX,
                  flipY: preset.flipY ?? preset.ps.tipShape.flipY,
                },
                texture: {
                  ...preset.ps.texture,
                  // Honor brush desc only — do not force on just because a pattern exists in the ABR
                  enabled: Boolean(preset.ps.texture.enabled),
                  patternDataUrl: preset.ps.texture.enabled ? texturePatternDataUrl : undefined,
                },
                dualBrush: {
                  ...preset.ps.dualBrush,
                  enabled: Boolean(
                    preset.ps.dualBrush.enabled && (dualTipDataUrl || preset.dualTip)
                  ),
                },
              }
            : undefined;

          const flat = ps ? psToLegacyFlat(ps) : null;
          const sizePx = Math.max(
            8,
            Math.min(
              500,
              preset.sizePx ??
                ps?.tipShape.sizePx ??
                Math.max(preset.tip.width, preset.tip.height)
            )
          );
          const dualOn = Boolean(ps?.dualBrush.enabled);
          const texOn = Boolean(ps?.texture.enabled);

          added.push(
            createCustomBrushFromTip(name, dataUrl, 'abr', {
              defaultSize: sizePx,
              tipSpacing: flat?.tipSpacing,
              scatter: flat?.scatter ?? 0,
              hardness: flat?.hardness ?? 0.5,
              tipAngle: flat?.tipAngle ?? 0,
              thickness: flat?.thickness ?? 1,
              sizePressure: flat?.sizePressure ?? 0.85,
              minSizeRatio: flat?.minSizeRatio ?? 0.02,
              directionMode: flat?.directionMode ?? 'none',
              stabilizer: flat?.stabilizer ?? 2,
              textureStrength: flat?.textureStrength ?? 0,
              sizeJitter: flat?.sizeJitter ?? 0,
              angleJitter: flat?.angleJitter ?? 0,
              opacityPressure: ps?.transfer.enabled ? 0.85 : 0.2,
              tipSpacingAuto: false,
              texture: 'normal',
              dualTipDataUrl: dualOn ? dualTipDataUrl : undefined,
              texturePatternDataUrl: texOn ? texturePatternDataUrl : undefined,
              ps,
              folderId,
              folderName,
            })
          );
        });
      }
      if (!added.length) throw new Error('empty abr');
      persist([...customs, ...added]);
      onSelectCustom(added[0].id);
    } catch {
      setError(t('drawing.importAbrFail'));
    } finally {
      setBusy(null);
      if (abrInputRef.current) abrInputRef.current.value = '';
    }
  };

  const importJsonBrushes = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(t('drawing.importingBrushes'));
    try {
      const added: CustomBrush[] = [];
      for (const file of Array.from(files)) {
        const brush = await parseBrushJsonFile(file);
        added.push({
          ...brush,
          folderId: USER_MADE_FOLDER_ID,
          folderName: USER_MADE_FOLDER_NAME,
        });
      }
      if (!added.length) throw new Error('empty');
      persist([...customs, ...added]);
      onSelectCustom(added[0].id);
    } catch {
      setError(t('drawing.importBrushJsonFail'));
    } finally {
      setBusy(null);
      if (jsonInputRef.current) jsonInputRef.current.value = '';
    }
  };

  const removeCustom = (id: string) => {
    const next = customs.filter((b) => b.id !== id);
    persist(next);
    if (selectedId === id) onSelectBuiltin(BRUSH_PRESETS[0]?.id ?? 'hard');
  };

  const removeFolder = (folder: BrushFolder) => {
    const label =
      folder.kind === 'user-made' ? t('drawing.userMadeFolder') : folder.name;
    const ok = window.confirm(
      t('drawing.deleteBrushFolderConfirm').replace('{name}', label).replace('{count}', String(folder.brushes.length))
    );
    if (!ok) return;
    const next = customs.filter((b) => b.folderId !== folder.id);
    persist(next);
    if (folder.brushes.some((b) => b.id === selectedId)) {
      onSelectBuiltin(BRUSH_PRESETS[0]?.id ?? 'hard');
    }
  };

  const folderTitle = (folder: BrushFolder) =>
    folder.kind === 'user-made' ? t('drawing.userMadeFolder') : folder.name;

  const builtinCards = useMemo(
    () =>
      BRUSH_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          title={t(`drawing.brushPreset.${p.labelKey}` as 'drawing.brushPreset.hard')}
          onClick={() => onSelectBuiltin(p.id)}
          className={`brush-lib-card flex flex-col items-center gap-0.5 p-1 rounded pixel-border-button ${
            selectedId === p.id ? 'is-active' : ''
          }`}
        >
          <span className="brush-lib-swatch w-10 h-10 rounded bg-white flex items-center justify-center overflow-hidden">
            <span
              className="block rounded-full bg-black"
              style={{
                width: Math.min(28, 4 + p.defaultSize),
                height: Math.min(28, 4 + p.defaultSize * (p.hardness && p.hardness < 0.3 ? 1.2 : 0.85)),
                opacity: (p.defaultOpacity / 100) * 0.9,
                filter: p.texture === 'airbrush' || p.texture === 'soft' ? 'blur(1.5px)' : undefined,
              }}
            />
          </span>
          <span className="text-[9px] theme-muted truncate w-full text-center">
            {t(`drawing.brushPreset.${p.labelKey}` as 'drawing.brushPreset.hard')}
          </span>
        </button>
      )),
    [onSelectBuiltin, selectedId, t]
  );

  const renderBrushCard = (b: CustomBrush) => (
    <div key={b.id} className="relative group">
      <button
        type="button"
        title={b.name}
        onClick={() => onSelectCustom(b.id)}
        className={`brush-lib-card w-full flex flex-col items-center gap-0.5 p-1 rounded pixel-border-button ${
          selectedId === b.id ? 'is-active' : ''
        }`}
      >
        <span className="brush-lib-swatch w-10 h-10 rounded bg-white flex items-center justify-center overflow-hidden">
          <img src={b.tipDataUrl} alt="" className="max-w-full max-h-full object-contain" />
        </span>
        <span className="text-[9px] theme-muted truncate w-full text-center">{b.name}</span>
      </button>
      <button
        type="button"
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] leading-none pixel-border-button opacity-0 group-hover:opacity-100"
        title={t('drawing.deleteBrush')}
        onClick={(e) => {
          e.stopPropagation();
          removeCustom(b.id);
        }}
      >
        ×
      </button>
      <button
        type="button"
        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full text-[8px] leading-none pixel-border-button opacity-0 group-hover:opacity-100"
        title={t('drawing.exportBrush')}
        onClick={(e) => {
          e.stopPropagation();
          downloadBrushJson(b);
        }}
      >
        ⤓
      </button>
    </div>
  );

  return (
    <div className="paint-dock w-[240px] p-2 space-y-2 theme-text select-none">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] uppercase theme-muted font-semibold">{t('drawing.brushLibrary')}</p>
        {busy && <span className="text-[9px] theme-muted truncate">{busy}</span>}
      </div>

      <div className="flex gap-1">
        <button
          type="button"
          className="flex-1 h-7 rounded text-[10px] pixel-border-button"
          onClick={() => imgInputRef.current?.click()}
        >
          {t('drawing.importImageBrush')}
        </button>
        <button
          type="button"
          className="flex-1 h-7 rounded text-[10px] pixel-border-button"
          onClick={() => abrInputRef.current?.click()}
        >
          {t('drawing.importAbrBrush')}
        </button>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          className="flex-1 h-7 rounded text-[10px] pixel-border-button"
          onClick={() => jsonInputRef.current?.click()}
        >
          {t('drawing.importBrushJson')}
        </button>
        {onExportCurrentBrush && (
          <button
            type="button"
            className="flex-1 h-7 rounded text-[10px] pixel-border-button"
            onClick={() => {
              const brush = onExportCurrentBrush();
              if (brush) {
                downloadBrushJson(brush);
                window.alert(t('drawing.exportBrushOk'));
              }
            }}
          >
            {t('drawing.exportBrush')}
          </button>
        )}
      </div>
      {onSaveCurrentBrush && (
        <button
          type="button"
          className="w-full h-7 rounded text-[10px] pixel-border-button"
          onClick={() => {
            const saved = onSaveCurrentBrush();
            if (saved) {
              persist([...customs.filter((b) => b.id !== saved.id), saved]);
              onSelectCustom(saved.id);
              window.alert(t('drawing.saveBrushOk'));
            }
          }}
        >
          {t('drawing.saveCurrentBrush')}
        </button>
      )}
      {createPortal(
        <>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => void importImages(e.target.files)}
          />
          <input
            ref={abrInputRef}
            type="file"
            accept=".abr,application/octet-stream"
            multiple
            className="hidden"
            onChange={(e) => void importAbr(e.target.files)}
          />
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json,.yinggebrush.json"
            multiple
            className="hidden"
            onChange={(e) => void importJsonBrushes(e.target.files)}
          />
        </>,
        document.body
      )}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <p className="text-[9px] text-amber-700 dark:text-amber-400 leading-snug">{t('drawing.abrTestingHint')}</p>
      <p className="text-[9px] theme-muted leading-snug">{t('drawing.brushImportHint')}</p>
      <p className="text-[9px] theme-muted leading-snug">{t('drawing.brushPresetRestoreHint')}</p>

      <div className="text-[10px] theme-muted border-t theme-divider pt-1">{t('drawing.builtinBrushes')}</div>
      <div className="grid grid-cols-4 gap-1">{builtinCards}</div>

      {folders.map((folder) => {
        const isCollapsed = Boolean(collapsed[folder.id]);
        return (
          <div key={folder.id} className="border-t theme-divider pt-1 space-y-1">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                className="flex-1 min-w-0 flex items-center gap-1 text-left text-[10px] theme-muted font-semibold"
                onClick={() => toggleFolder(folder.id)}
                title={folderTitle(folder)}
              >
                <span className="shrink-0 w-3 text-center">{isCollapsed ? '▸' : '▾'}</span>
                <span className="truncate">
                  {folder.kind === 'abr' ? '📦 ' : '📁 '}
                  {folderTitle(folder)}
                </span>
                <span className="shrink-0 opacity-70">({folder.brushes.length})</span>
              </button>
              <button
                type="button"
                className="shrink-0 h-5 px-1 rounded text-[9px] pixel-border-button"
                title={t('drawing.deleteBrushFolder')}
                onClick={() => removeFolder(folder)}
              >
                {t('drawing.deleteBrushFolder')}
              </button>
            </div>
            {!isCollapsed && (
              <div className="grid grid-cols-4 gap-1">{folder.brushes.map(renderBrushCard)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
