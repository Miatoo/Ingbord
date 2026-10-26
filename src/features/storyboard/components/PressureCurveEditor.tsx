import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  DEFAULT_PRESSURE_SIZE_CURVE,
  normalizePressureCurve,
  type PressureCurvePoint,
} from '../../../utils/pressureCurve';

interface PressureCurveEditorProps {
  value: PressureCurvePoint[];
  onChange: (points: PressureCurvePoint[]) => void;
  /** Pixel size of the square editor. */
  size?: number;
}

/**
 * Interactive pressure→size curve (X = pen pressure, Y = brush size response).
 * Drag points; double-click empty area to add; double-click a mid point to remove.
 */
export function PressureCurveEditor({
  value,
  onChange,
  size = 180,
}: PressureCurveEditorProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const pointsRef = useRef(value);
  pointsRef.current = value;

  const toCanvas = useCallback(
    (p: PressureCurvePoint) => ({
      x: p.x * size,
      y: (1 - p.y) * size,
    }),
    [size]
  );

  const fromCanvas = useCallback(
    (cx: number, cy: number): PressureCurvePoint => ({
      x: Math.max(0, Math.min(1, cx / size)),
      y: Math.max(0, Math.min(1, 1 - cy / size)),
    }),
    [size]
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const g = (size * i) / 4;
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, size);
      ctx.moveTo(0, g);
      ctx.lineTo(size, g);
      ctx.stroke();
    }

    // Diagonal reference (linear)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    const pts = normalizePressureCurve(value);
    ctx.strokeStyle = '#5b9cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const c = toCanvas(p);
      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    });
    ctx.stroke();

    pts.forEach((p, i) => {
      const c = toCanvas(p);
      ctx.beginPath();
      ctx.arc(c.x, c.y, i === 0 || i === pts.length - 1 ? 5 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = dragIndex === i ? '#fff' : '#5b9cff';
      ctx.fill();
      ctx.strokeStyle = '#0b0b0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [value, size, toCanvas, dragIndex]);

  useEffect(() => {
    paint();
  }, [paint]);

  const hitTest = (cx: number, cy: number) => {
    const pts = normalizePressureCurve(pointsRef.current);
    let best = -1;
    let bestDist = 12;
    pts.forEach((p, i) => {
      const c = toCanvas(p);
      const d = Math.hypot(c.x - cx, c.y - cy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const clientToLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = clientToLocal(e);
    let idx = hitTest(x, y);
    if (idx < 0) {
      const next = normalizePressureCurve([...pointsRef.current, fromCanvas(x, y)]);
      onChange(next);
      idx = next.findIndex((p) => {
        const c = toCanvas(p);
        return Math.hypot(c.x - x, c.y - y) < 14;
      });
    }
    if (idx >= 0) {
      setDragIndex(idx);
      canvasRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIndex == null) return;
    const { x, y } = clientToLocal(e);
    const pts = normalizePressureCurve(pointsRef.current).map((p) => ({ ...p }));
    const mapped = fromCanvas(x, y);
    if (dragIndex === 0) {
      pts[0] = { x: 0, y: mapped.y };
    } else if (dragIndex === pts.length - 1) {
      pts[pts.length - 1] = { x: 1, y: mapped.y };
    } else {
      const minX = pts[dragIndex - 1].x + 0.02;
      const maxX = pts[dragIndex + 1].x - 0.02;
      pts[dragIndex] = {
        x: Math.max(minX, Math.min(maxX, mapped.x)),
        y: mapped.y,
      };
    }
    onChange(normalizePressureCurve(pts));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setDragIndex(null);
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = (() => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    })();
    const idx = hitTest(x, y);
    if (idx > 0 && idx < normalizePressureCurve(pointsRef.current).length - 1) {
      const next = normalizePressureCurve(pointsRef.current.filter((_, i) => i !== idx));
      onChange(next);
      return;
    }
    if (idx < 0) {
      onChange(normalizePressureCurve([...pointsRef.current, fromCanvas(x, y)]));
    }
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="rounded border border-black/40 dark:border-white/30 touch-none cursor-crosshair w-full max-w-[220px]"
        style={{ touchAction: 'none', width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="pixel-border-button px-2 py-1 text-xs"
          onClick={() => onChange(DEFAULT_PRESSURE_SIZE_CURVE.map((p) => ({ ...p })))}
        >
          {t('settings.pressureCurve.linear')}
        </button>
        <button
          type="button"
          className="pixel-border-button px-2 py-1 text-xs"
          onClick={() =>
            onChange(
              normalizePressureCurve([
                { x: 0, y: 0 },
                { x: 0.35, y: 0.12 },
                { x: 0.7, y: 0.55 },
                { x: 1, y: 1 },
              ])
            )
          }
        >
          {t('settings.pressureCurve.soft')}
        </button>
        <button
          type="button"
          className="pixel-border-button px-2 py-1 text-xs"
          onClick={() =>
            onChange(
              normalizePressureCurve([
                { x: 0, y: 0 },
                { x: 0.25, y: 0.45 },
                { x: 0.55, y: 0.85 },
                { x: 1, y: 1 },
              ])
            )
          }
        >
          {t('settings.pressureCurve.firm')}
        </button>
      </div>
    </div>
  );
}
