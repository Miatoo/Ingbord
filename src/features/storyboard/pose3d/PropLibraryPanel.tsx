import { useEffect, useMemo, useState } from 'react';
import { PoseEditorCanvasRef } from './PoseEditorCanvas';
import { useTranslation } from '../../../i18n/useTranslation';
import { getAssetPath } from '../../../utils/pathUtils';
import { FloatingPanel } from '../drawing/FloatingPanel';
import { ObjectThumb } from './ObjectThumb';
import {
  enqueueObjectThumbGeneration,
  resumeObjectThumbGeneration,
  warmObjectThumbCache,
} from './objectThumbService';

interface ObjectDef {
  id: string;
  name: string;
  type?: string;
  height?: number;
}

interface PropLibraryPanelProps {
  canvasRef?: React.RefObject<PoseEditorCanvasRef>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Standalone prop library — mount under float-root, not inside another panel. */
export function PropLibraryPanel({ canvasRef, open, onOpenChange }: PropLibraryPanelProps) {
  const { t } = useTranslation();
  const [objects, setObjects] = useState<ObjectDef[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const loadObjects = async () => {
      try {
        const response = await fetch(getAssetPath('/models/cameras/objects.json'));
        if (response.ok) {
          const data = await response.json();
          const arr = Object.keys(data).map((key) => ({
            id: key,
            name: data[key].name || key,
            type: data[key].type,
            height: data[key].height,
          }));
          arr.sort((a, b) => a.name.localeCompare(b.name));
          setObjects(arr);
        }
      } catch {
        setObjects([]);
      }
    };
    void loadObjects();
  }, []);

  useEffect(() => {
    if (!objects.length) return;
    resumeObjectThumbGeneration();
    const ids = objects.map((o) => o.id).filter(Boolean);
    void warmObjectThumbCache(ids).then(() => enqueueObjectThumbGeneration(ids));
  }, [objects]);

  const objectLabel = (obj: ObjectDef) => {
    const translationKey = `pose3d.object.${obj.id}`;
    const translated = (t as (k: string) => string)(translationKey);
    return translated && translated !== translationKey ? translated : obj.name || obj.id;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return objects;
    return objects.filter((obj) => {
      const label = objectLabel(obj).toLowerCase();
      return label.includes(q) || obj.id.toLowerCase().includes(q) || obj.name.toLowerCase().includes(q);
    });
  }, [objects, query]);

  useEffect(() => {
    if (!open || !objects.length) return;
    resumeObjectThumbGeneration();
    enqueueObjectThumbGeneration((filtered.length ? filtered : objects).map((o) => o.id));
  }, [open, filtered, objects]);

  const handleAddObject = (obj: ObjectDef) => {
    if (!canvasRef?.current) return;
    const path = getAssetPath(`/models/characters/${obj.id}.glb`);
    canvasRef.current.addObject(path, obj.id);
  };

  return (
    <FloatingPanel
      id="pose-prop-library"
      title={t('pose3d.propLibrary')}
      defaultPos={{ x: 320, y: 80 }}
      open={open}
      onOpenChange={onOpenChange}
      width={340}
      defaultHeight={480}
      zIndex={70}
    >
      <div className="flex flex-col gap-2 h-full min-h-0" style={{ maxHeight: 'min(70vh, 520px)' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('pose3d.searchProps')}
          className="w-full px-2 py-1 text-sm border border-black/30 dark:border-white/30 bg-transparent shrink-0"
          style={{ borderRadius: 0 }}
        />
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          <div className="grid grid-cols-3 gap-1.5">
            {filtered.map((obj) => {
              const label = objectLabel(obj);
              return (
                <button
                  key={obj.id}
                  type="button"
                  onClick={() => handleAddObject(obj)}
                  className="pose-lib-thumb text-left flex flex-col gap-0.5 border border-black/20 dark:border-white/20 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 p-0 overflow-hidden"
                  style={{ borderRadius: 0 }}
                  title={label}
                >
                  <ObjectThumb objectId={obj.id} label={label} />
                  <span className="text-[10px] leading-tight line-clamp-2 px-0.5 pb-0.5 text-center">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}
