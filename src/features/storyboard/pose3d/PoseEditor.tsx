import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import { PoseEditorCanvas, PoseEditorCanvasRef } from './PoseEditorCanvas';
import { PoseControls } from './PoseControls';
import { CameraControls } from './CameraControls';
import { PosePresets } from './PosePresets';
import { ActionLibraryPanel } from './ActionLibraryPanel';
import { HandPosePresets } from './HandPosePresets';
import { ObjectLibrary } from './ObjectLibrary';
import { PropLibraryPanel } from './PropLibraryPanel';
import { CameraLibrary } from './CameraLibrary';
import { ScenePresets } from './ScenePresets';
import { CharacterList } from './CharacterList';
import { PoseEditorRefContext } from './PoseEditorContext';
import { useTranslation } from '../../../i18n/useTranslation';
import { useTabletLayout } from '../../../hooks/useTabletLayout';
import { FloatingPanel } from '../drawing/FloatingPanel';

type PosePanelKey = 'characters' | 'poses' | 'hands' | 'objects' | 'cameras' | 'scenes' | 'camera' | 'controls';

export function PoseEditor() {
  const { t } = useTranslation();
  const activeShotId = useUIStore((state) => state.activeShotId);
  const getShot = useProjectStore((state) => state.getShot);
  const canvasRef = useRef<PoseEditorCanvasRef>(null);
  const floatRootRef = useRef<HTMLDivElement>(null);
  const tablet = useTabletLayout();
  const openDrawer = useUIStore((state) => state.openDrawer);
  const closeDrawer = useUIStore((state) => state.closeDrawer);
  const [rightX, setRightX] = useState(400);

  const [panelsHidden, setPanelsHidden] = useState(false);
  const [actionLibOpen, setActionLibOpen] = useState(false);
  const [propLibOpen, setPropLibOpen] = useState(false);
  const [openMap, setOpenMap] = useState<Record<PosePanelKey, boolean>>({
    characters: true,
    poses: true,
    hands: false,
    objects: false,
    cameras: false,
    scenes: false,
    camera: true,
    controls: true,
  });
  const [panelZ, setPanelZ] = useState<Record<PosePanelKey, number>>({
    characters: 50,
    poses: 49,
    hands: 48,
    objects: 47,
    cameras: 46,
    scenes: 45,
    camera: 44,
    controls: 43,
  });
  const zCounter = useRef(60);

  const shot = activeShotId ? getShot(activeShotId) : null;

  useEffect(() => {
    if (tablet) openDrawer('poseControls');
    return () => closeDrawer('poseControls');
  }, [tablet, openDrawer, closeDrawer]);

  useEffect(() => {
    if (!tablet) return;
    setOpenMap((m) => ({
      ...m,
      hands: false,
      objects: false,
      cameras: false,
      scenes: false,
    }));
  }, [tablet]);

  useLayoutEffect(() => {
    const el = floatRootRef.current;
    if (!el) return;
    const update = () => setRightX(Math.max(12, el.clientWidth - 288));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shot?.id]);

  const focusPanel = useCallback((key: PosePanelKey) => {
    zCounter.current += 1;
    setPanelZ((prev) => ({ ...prev, [key]: zCounter.current }));
  }, []);

  const setPanelOpen = (key: PosePanelKey, open: boolean) => {
    setOpenMap((m) => ({ ...m, [key]: open }));
  };

  if (!shot) {
    return (
      <div className="retro-window flex-1 flex items-center justify-center text-gray-400 bg-white dark:bg-gray-900">
        <div className="retro-header">
          <span>3D_POSE_EDITOR</span>
        </div>
        <div className="p-4">{t('metadata.selectShot')}</div>
      </div>
    );
  }

  const panelBody = 'p-2 max-h-[55vh] overflow-y-auto theme-text bg-transparent';

  const launchers: { key: PosePanelKey; label: string }[] = [
    { key: 'characters', label: t('pose3d.panel.characters') },
    { key: 'poses', label: t('pose3d.panel.poses') },
    { key: 'hands', label: t('pose3d.panel.hands') },
    { key: 'objects', label: t('pose3d.panel.objects') },
    { key: 'cameras', label: t('pose3d.panel.cameras') },
    { key: 'scenes', label: t('pose3d.panel.scenes') },
    { key: 'camera', label: t('pose3d.panel.camera') },
    { key: 'controls', label: t('pose3d.panel.controls') },
  ];

  return (
    <PoseEditorRefContext.Provider value={canvasRef}>
      <div
        ref={floatRootRef}
        className="flex-1 relative min-h-0 bg-gray-900 overflow-hidden"
        data-float-root
      >
        <div className="absolute inset-0">
          <PoseEditorCanvas ref={canvasRef} shotId={shot.id} />
        </div>

        {panelsHidden ? (
          <button
            type="button"
            className="absolute left-2 top-2 z-[80] px-2 py-1 text-xs rounded bg-[#2f333a] text-white"
            onClick={() => setPanelsHidden(false)}
          >
            {t('pose3d.showPanels')}
          </button>
        ) : (
          <div
            className="absolute right-2 top-2 z-[80] flex flex-wrap gap-1 max-w-[55%] justify-end"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {launchers.map(({ key, label }) =>
              !openMap[key] ? (
                <button
                  key={key}
                  type="button"
                  className="px-2 py-1 text-xs rounded bg-[#2f333a] text-white"
                  onClick={() => setPanelOpen(key, true)}
                >
                  {label}
                </button>
              ) : null
            )}
            <button
              type="button"
              className="px-2 py-1 text-xs rounded bg-[#2f333a] text-white"
              onClick={() => setPanelsHidden(true)}
            >
              {t('pose3d.hidePanels')}
            </button>
          </div>
        )}

        {!panelsHidden && (
          <>
            <FloatingPanel
              id={tablet ? 'pose-characters-t' : 'pose-characters'}
              title={t('pose3d.panel.characters')}
              defaultPos={{ x: tablet ? 8 : 12, y: 52 }}
              open={openMap.characters}
              onOpenChange={(o) => setPanelOpen('characters', o)}
              width={260}
              zIndex={panelZ.characters}
              onFocus={() => focusPanel('characters')}
            >
              <div className={panelBody}>
                <CharacterList canvasRef={canvasRef} />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-presets-t' : 'pose-presets'}
              title={t('pose3d.panel.poses')}
              defaultPos={{ x: tablet ? 8 : 12, y: 280 }}
              open={openMap.poses}
              onOpenChange={(o) => setPanelOpen('poses', o)}
              width={260}
              zIndex={panelZ.poses}
              onFocus={() => focusPanel('poses')}
            >
              <div className={panelBody}>
                <PosePresets
                  shotId={shot.id}
                  canvasRef={canvasRef}
                  onOpenActionLibrary={() => setActionLibOpen(true)}
                />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-hands-t' : 'pose-hands'}
              title={t('pose3d.panel.hands')}
              defaultPos={{ x: tablet ? 8 : 280, y: 52 }}
              open={openMap.hands}
              onOpenChange={(o) => setPanelOpen('hands', o)}
              width={260}
              zIndex={panelZ.hands}
              onFocus={() => focusPanel('hands')}
            >
              <div className={panelBody}>
                <HandPosePresets shotId={shot.id} canvasRef={canvasRef} />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-objects-t' : 'pose-objects'}
              title={t('pose3d.panel.objects')}
              defaultPos={{ x: tablet ? 8 : 280, y: 280 }}
              open={openMap.objects}
              onOpenChange={(o) => setPanelOpen('objects', o)}
              width={260}
              zIndex={panelZ.objects}
              onFocus={() => focusPanel('objects')}
            >
              <div className={panelBody}>
                <ObjectLibrary
                  canvasRef={canvasRef}
                  onOpenPropLibrary={() => setPropLibOpen(true)}
                />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-camlib-t' : 'pose-camlib'}
              title={t('pose3d.panel.cameras')}
              defaultPos={{ x: rightX, y: 320 }}
              open={openMap.cameras}
              onOpenChange={(o) => setPanelOpen('cameras', o)}
              width={260}
              zIndex={panelZ.cameras}
              onFocus={() => focusPanel('cameras')}
            >
              <div className={panelBody}>
                <CameraLibrary canvasRef={canvasRef} />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-scenes-t' : 'pose-scenes'}
              title={t('pose3d.panel.scenes')}
              defaultPos={{ x: rightX, y: 420 }}
              open={openMap.scenes}
              onOpenChange={(o) => setPanelOpen('scenes', o)}
              width={260}
              zIndex={panelZ.scenes}
              onFocus={() => focusPanel('scenes')}
            >
              <div className={panelBody}>
                <ScenePresets canvasRef={canvasRef} />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-camera-t' : 'pose-camera'}
              title={t('pose3d.panel.camera')}
              defaultPos={{ x: rightX, y: 52 }}
              open={openMap.camera}
              onOpenChange={(o) => setPanelOpen('camera', o)}
              width={280}
              zIndex={panelZ.camera}
              onFocus={() => focusPanel('camera')}
            >
              <div className={panelBody}>
                <CameraControls shotId={shot.id} />
              </div>
            </FloatingPanel>

            <FloatingPanel
              id={tablet ? 'pose-controls-t' : 'pose-controls'}
              title={t('pose3d.panel.controls')}
              defaultPos={{ x: rightX, y: 200 }}
              open={openMap.controls}
              onOpenChange={(o) => setPanelOpen('controls', o)}
              width={280}
              zIndex={panelZ.controls}
              onFocus={() => focusPanel('controls')}
            >
              <div className={panelBody}>
                <PoseControls ref={canvasRef} shotId={shot.id} />
              </div>
            </FloatingPanel>
          </>
        )}

        {/* Always under float-root (not nested in other panels) so merge tabs keep content */}
        <ActionLibraryPanel
          canvasRef={canvasRef}
          open={actionLibOpen}
          onOpenChange={setActionLibOpen}
        />
        <PropLibraryPanel
          canvasRef={canvasRef}
          open={propLibOpen}
          onOpenChange={setPropLibOpen}
        />
      </div>
    </PoseEditorRefContext.Provider>
  );
}
