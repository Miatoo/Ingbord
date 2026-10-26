import { forwardRef, useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../../../store/projectStore';
import { PoseEditorCanvasRef, POSE_EDITOR_APPLY_SCALE, POSE_EDITOR_SCALE_APPLIED } from './PoseEditorCanvas';
import { usePoseEditorRef } from './PoseEditorContext';
import { useTranslation } from '../../../i18n/useTranslation';
import { cropToSafeFrame } from '../../../utils/imageUtils';
import { appendPoseLayer } from '../../../utils/drawingLayers';

interface PoseControlsProps {
  shotId: string;
}

export const PoseControls = forwardRef<PoseEditorCanvasRef, PoseControlsProps>(
  ({ shotId }, refFromProps) => {
    const { t } = useTranslation();
    const project = useProjectStore((state) => state.project);
    const getShot = useProjectStore((state) => state.getShot);
    const updateShot = useProjectStore((state) => state.updateShot);
    const canvasRefFromContext = usePoseEditorRef();
    const ref = refFromProps ?? canvasRefFromContext;
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
    const [scaleInput, setScaleInput] = useState<string>('1');
    const [modelColor, setModelColor] = useState('#ff6633');
    const [tintStrength, setTintStrength] = useState(0);
    const [includeGround, setIncludeGround] = useState(false);
    const scaleInputRef = useRef<HTMLInputElement | null>(null);

    const shot = getShot(shotId);
    if (!shot) return null;

    // 定期同步：变换模式 + 缩放数值（输入框未聚焦时从画布同步）
    useEffect(() => {
      const interval = setInterval(() => {
        const api = ref && typeof ref !== 'function' ? ref.current : null;
        if (api) {
          const currentMode = api.getTransformMode();
          if (currentMode && currentMode !== transformMode) {
            setTransformMode(currentMode);
          }
          if (document.activeElement !== scaleInputRef.current && typeof api.getScaleValue === 'function') {
            const scaleVal = api.getScaleValue();
            if (scaleVal != null) {
              const str = scaleVal.toFixed(3);
              setScaleInput((prev) => (prev !== str ? str : prev));
            }
          }
        }
      }, 150);
      return () => clearInterval(interval);
    }, [ref, transformMode]);

    const handleApplyScale = () => {
      const v = parseFloat(scaleInput);
      if (Number.isNaN(v)) return;
      const api = ref && typeof ref !== 'function' ? ref.current : null;
      if (api && typeof api.setScaleByValue === 'function') {
        api.setScaleByValue(v);
        window.dispatchEvent(new CustomEvent(POSE_EDITOR_SCALE_APPLIED, { detail: { scale: v } }));
      } else {
        window.dispatchEvent(new CustomEvent(POSE_EDITOR_APPLY_SCALE, { detail: { scale: v } }));
      }
    };

    useEffect(() => {
      const handler = (e: Event) => {
        const scale = (e as CustomEvent).detail?.scale;
        if (typeof scale === 'number' && !Number.isNaN(scale)) {
          setScaleInput(scale.toFixed(3));
        }
      };
      window.addEventListener(POSE_EDITOR_SCALE_APPLIED, handler);
      return () => window.removeEventListener(POSE_EDITOR_SCALE_APPLIED, handler);
    }, []);

    const handleSetMode = (mode: 'translate' | 'rotate' | 'scale') => {
      const api = ref && typeof ref !== 'function' ? ref.current : null;
      if (api) {
        api.setTransformMode(mode);
        setTransformMode(mode);
      }
    };

    const handleGenerateImage = async () => {
      if (!ref || typeof ref === 'function' || !ref.current) {
        console.error('Canvas ref 不可用');
        return;
      }

      try {
        // 从当前视角渲染截图
        const imageData = await ref.current.renderToImage({ includeGround });

        // 裁剪图片到安全框内
        let croppedImage = imageData;
        if (project?.aspectRatio) {
          try {
            croppedImage = await cropToSafeFrame(imageData, project.aspectRatio);
          } catch (error) {
            console.error('裁剪图片失败:', error);
            // 如果裁剪失败，使用原图
          }
        }

        const ratio = project?.aspectRatio || '16:9';
        const [wStr, hStr] = ratio.split(':');
        const w = parseFloat(wStr || '16');
        const h = parseFloat(hStr || '9');
        const longEdge = 1920;
        const size = w >= h
          ? { width: longEdge, height: Math.max(1, Math.round((longEdge * h) / w)) }
          : { width: Math.max(1, Math.round((longEdge * w) / h)), height: longEdge };
        const packed = await appendPoseLayer(shot.layers, shot.image, croppedImage, size);

        updateShot(shotId, {
          image: packed.image,
          layers: packed.layers,
          activeLayerId: packed.activeLayerId,
          imageSource: '3d_pose',
          sourceParams: shot.sourceParams || {
            pose3d: {
              pose: { joints: {}, presetName: 'standing' },
              camera: {
                framing: shot.framing,
                angle: shot.cameraAngle,
                position: { x: 0, y: 1.6, z: 4 },
                rotation: { x: 0, y: 0, z: 0 },
                fov: 50,
              },
              renderStyle: 'wireframe',
            },
          },
        });
      } catch (error) {
        console.error('生成镜头图失败:', error);
      }
    };

    return (
      <div className="space-y-3 border-t-2 border-black dark:border-white pt-3">
        {/* 变换模式控制 */}
        <div>
          <label className="block text-sm font-bold uppercase mb-2">
            {t('pose3d.transformMode')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleSetMode('translate')}
              className={`pixel-border-button px-3 py-1 text-sm ${
                transformMode === 'translate'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
              title={`${t('pose3d.move')} (T)`}
            >
              {t('pose3d.move')}
            </button>
            <button
              onClick={() => handleSetMode('rotate')}
              className={`pixel-border-button px-3 py-1 text-sm ${
                transformMode === 'rotate'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
              title={`${t('pose3d.rotate')} (R)`}
            >
              {t('pose3d.rotate')}
            </button>
            <button
              onClick={() => handleSetMode('scale')}
              className={`pixel-border-button px-3 py-1 text-sm ${
                transformMode === 'scale'
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
              title={`${t('pose3d.scale')} (S)`}
            >
              {t('pose3d.scale')}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            {t('pose3d.shortcuts')}
          </p>
        </div>

        {/* 移动模式：将当前选中的 Hips 移动到世界原点 */}
        {transformMode === 'translate' && (
          <div>
            <button
              type="button"
              onClick={() => ref && typeof ref !== 'function' && ref.current?.moveSelectedToOrigin()}
              className="pixel-border-button w-full px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              Hips 移动到原点
            </button>
          </div>
        )}

        {/* 缩放数值：选中角色后输入 0.01～100 点应用即可 */}
        <div>
          <label className="block text-sm font-bold uppercase mb-2">
              {t('pose3d.scale')}
          </label>
          <div className="flex gap-2 items-center">
            <input
              ref={scaleInputRef}
              type="number"
              min={0.01}
              max={100}
              step={0.01}
              value={scaleInput}
              onChange={(e) => setScaleInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyScale()}
              placeholder="1"
              className="pixel-border-button flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 min-w-0"
              aria-label="缩放数值"
            />
            <button
              type="button"
              onClick={handleApplyScale}
              className="pixel-border-button px-3 py-1 text-sm bg-black text-white dark:bg-white dark:text-black shrink-0"
            >
              {t('pose3d.apply') ?? '应用'}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold uppercase mb-2">
            {t('pose3d.modelColor')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={modelColor}
              onChange={(e) => {
                const next = e.target.value;
                setModelColor(next);
                const api = ref && typeof ref !== 'function' ? ref.current : null;
                api?.setModelTint(next, tintStrength / 100);
              }}
              className="h-8 w-10 border-0 bg-transparent p-0"
              aria-label={t('pose3d.modelColor')}
            />
            <label className="flex-1 text-xs">
              {t('pose3d.modelColorStrength')} {tintStrength}%
              <input
                type="range"
                min={0}
                max={100}
                value={tintStrength}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setTintStrength(next);
                  const api = ref && typeof ref !== 'function' ? ref.current : null;
                  api?.setModelTint(modelColor, next / 100);
                }}
                className="w-full"
              />
            </label>
          </div>
        </div>

        {/* 生成按钮 */}
        <div>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeGround}
              onChange={(e) => setIncludeGround(e.target.checked)}
              className="h-4 w-4"
            />
            {t('pose3d.includeGround')}
          </label>
          <button
            onClick={handleGenerateImage}
            className="pixel-border-button w-full px-4 py-2 bg-black text-white dark:bg-white dark:text-black"
          >
            {t('pose3d.generateShotImage')}
          </button>
          <p className="text-xs text-gray-500 mt-2 text-center">
            {t('pose3d.generateShotHint')}
          </p>
        </div>
      </div>
    );
  }
);

PoseControls.displayName = 'PoseControls';
