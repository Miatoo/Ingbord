import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';

interface ColorWheelProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  onClose?: () => void;
  /** Smaller wheel for MoArt-style paint dock */
  compact?: boolean;
}

// HSV 转 RGB
function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// RGB 转 HSV
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    if (max === r) {
      h = ((g - b) / diff) % 6;
    } else if (max === g) {
      h = (b - r) / diff + 2;
    } else {
      h = (r - g) / diff + 4;
    }
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return { h, s, v };
}

// RGB 转十六进制
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

// 十六进制转 RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 0, b: 0 };
}

export function ColorWheel({ currentColor, onColorChange, onClose, compact = false }: ColorWheelProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const brightnessRef = useRef<HTMLCanvasElement>(null);
  const onColorChangeRef = useRef(onColorChange);
  onColorChangeRef.current = onColorChange;
  const [hsv, setHsv] = useState(() => {
    const rgb = hexToRgb(currentColor);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingBrightness, setIsDraggingBrightness] = useState(false);
  const isDraggingRef = useRef(false);
  const isDraggingBrightnessRef = useRef(false);
  isDraggingRef.current = isDragging;
  isDraggingBrightnessRef.current = isDraggingBrightness;

  const size = compact ? 168 : 200;
  const center = size / 2;
  const radius = compact ? 72 : 85;

  /** User-driven HSV update — emit hex only from interaction, never from prop sync. */
  const updateHsvFromUser = (
    updater: (prev: { h: number; s: number; v: number }) => { h: number; s: number; v: number }
  ) => {
    setHsv((prev) => {
      const next = updater(prev);
      const { r, g, b } = hsvToRgb(next.h, next.s, next.v);
      onColorChangeRef.current(rgbToHex(r, g, b));
      return next;
    });
  };

  // Sync wheel when FG/BG / swap / eyedropper changes the active swatch externally
  useEffect(() => {
    if (isDraggingRef.current || isDraggingBrightnessRef.current) return;
    const rgb = hexToRgb(currentColor);
    const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
    setHsv((prev) => {
      if (
        Math.abs(prev.h - next.h) < 0.5 &&
        Math.abs(prev.s - next.s) < 0.01 &&
        Math.abs(prev.v - next.v) < 0.01
      ) {
        return prev;
      }
      return next;
    });
  }, [currentColor]);

  // 绘制色轮
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    // 绘制色轮
    for (let angle = 0; angle < 360; angle += 0.5) {
      const h = angle;
      for (let r = 0; r < radius; r++) {
        const s = r / radius;
        const v = 1;
        const { r: rgbR, g: rgbG, b: rgbB } = hsvToRgb(h, s, v);
        const x = center + Math.cos((angle * Math.PI) / 180) * r;
        const y = center + Math.sin((angle * Math.PI) / 180) * r;
        ctx.fillStyle = `rgb(${rgbR}, ${rgbG}, ${rgbB})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // 绘制当前选择的点
    const s = hsv.s;
    const angle = (hsv.h * Math.PI) / 180;
    const r = s * radius;
    const x = center + Math.cos(angle) * r;
    const y = center + Math.sin(angle) * r;

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv.h, hsv.s, size, center, radius]);

  // 绘制亮度条
  useEffect(() => {
    const canvas = brightnessRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barW = compact ? 14 : 20;
    canvas.width = barW;
    canvas.height = size;

    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    const { r, g, b } = hsvToRgb(hsv.h, hsv.s, 1);
    gradient.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
    gradient.addColorStop(1, 'rgb(0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, barW, size);

    // 绘制亮度指示器
    const y = size * (1 - hsv.v);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(barW, y);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hsv.h, hsv.s, hsv.v, compact, size]);

  // 获取坐标（支持鼠标和触控笔）
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX: number;
    let clientY: number;

    if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return null;
    }

    return {
      x: clientX - rect.left - center,
      y: clientY - rect.top - center,
    };
  };

  // 处理色轮点击/拖拽（鼠标事件）
  const handleColorWheelMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    handleColorWheelMouseMove(e);
  };

  const handleColorWheelMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging && !isDraggingBrightness) return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const { x, y } = coords;
    const distance = Math.sqrt(x * x + y * y);
    const angle = Math.atan2(y, x) * (180 / Math.PI);
    const h = (angle + 360) % 360;
    const s = Math.min(1, distance / radius);

    updateHsvFromUser((prev) => ({ ...prev, h, s }));
  };

  const handleColorWheelMouseUp = () => {
    setIsDragging(false);
  };

  // 处理色轮点击/拖拽（Pointer事件，支持触控笔）
  const handleColorWheelPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // 触控笔或触摸设备
    if (e.pointerType === 'pen' || e.pointerType === 'touch') {
      e.preventDefault(); // 防止默认行为
      setIsDragging(true);
      handleColorWheelPointerMove(e);
    }
  };

  const handleColorWheelPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging && !isDraggingBrightness) return;
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch' && e.pointerType !== 'mouse') return;

    const coords = getCoordinates(e);
    if (!coords) return;

    const { x, y } = coords;
    const distance = Math.sqrt(x * x + y * y);
    const angle = Math.atan2(y, x) * (180 / Math.PI);
    const h = (angle + 360) % 360;
    const s = Math.min(1, distance / radius);

    // 触控笔压力感应（可选，用于微调饱和度）
    let adjustedS = s;
    if (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) {
      // 压力越大，饱和度稍微增加（微调效果）
      adjustedS = Math.min(1, s * (0.95 + e.pressure * 0.1));
    }

    updateHsvFromUser((prev) => ({ ...prev, h, s: adjustedS }));
  };

  const handleColorWheelPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen' || e.pointerType === 'touch') {
      setIsDragging(false);
    }
  };

  // 获取亮度条坐标
  const getBrightnessCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = brightnessRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientY: number;

    if ('clientY' in e) {
      clientY = e.clientY;
    } else {
      return null;
    }

    return {
      y: clientY - rect.top,
    };
  };

  // 处理亮度条点击/拖拽（鼠标事件）
  const handleBrightnessMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDraggingBrightness(true);
    handleBrightnessMouseMove(e);
  };

  const handleBrightnessMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingBrightness && !isDragging) return;

    const coords = getBrightnessCoordinates(e);
    if (!coords) return;

    const { y } = coords;
    const v = Math.max(0, Math.min(1, 1 - y / size));

    updateHsvFromUser((prev) => ({ ...prev, v }));
  };

  const handleBrightnessMouseUp = () => {
    setIsDraggingBrightness(false);
  };

  // 处理亮度条点击/拖拽（Pointer事件，支持触控笔）
  const handleBrightnessPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen' || e.pointerType === 'touch') {
      e.preventDefault();
      setIsDraggingBrightness(true);
      handleBrightnessPointerMove(e);
    }
  };

  const handleBrightnessPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingBrightness && !isDragging) return;
    if (e.pointerType !== 'pen' && e.pointerType !== 'touch' && e.pointerType !== 'mouse') return;

    const coords = getBrightnessCoordinates(e);
    if (!coords) return;

    const { y } = coords;
    let v = Math.max(0, Math.min(1, 1 - y / size));

    // 触控笔压力感应（可选，用于微调亮度）
    if (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) {
      // 压力越大，亮度稍微增加（微调效果）
      v = Math.min(1, v * (0.95 + e.pressure * 0.1));
    }

    updateHsvFromUser((prev) => ({ ...prev, v }));
  };

  const handleBrightnessPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'pen' || e.pointerType === 'touch') {
      setIsDraggingBrightness(false);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - center;
        const y = e.clientY - rect.top - center;
        const distance = Math.sqrt(x * x + y * y);
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        const h = (angle + 360) % 360;
        const s = Math.min(1, distance / radius);
        updateHsvFromUser((prev) => ({ ...prev, h, s }));
      }
      if (isDraggingBrightness) {
        const canvas = brightnessRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const v = Math.max(0, Math.min(1, 1 - y / size));
        updateHsvFromUser((prev) => ({ ...prev, v }));
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      // 只处理触控笔和触摸事件
      if (e.pointerType !== 'pen' && e.pointerType !== 'touch') return;

      if (isDragging) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - center;
        const y = e.clientY - rect.top - center;
        const distance = Math.sqrt(x * x + y * y);
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        const h = (angle + 360) % 360;
        let s = Math.min(1, distance / radius);

        // 触控笔压力感应
        if (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) {
          s = Math.min(1, s * (0.95 + e.pressure * 0.1));
        }

        updateHsvFromUser((prev) => ({ ...prev, h, s }));
      }
      if (isDraggingBrightness) {
        const canvas = brightnessRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        let v = Math.max(0, Math.min(1, 1 - y / size));

        // 触控笔压力感应
        if (e.pointerType === 'pen' && e.pressure !== undefined && e.pressure > 0) {
          v = Math.min(1, v * (0.95 + e.pressure * 0.1));
        }

        updateHsvFromUser((prev) => ({ ...prev, v }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsDraggingBrightness(false);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen' || e.pointerType === 'touch') {
        setIsDragging(false);
        setIsDraggingBrightness(false);
      }
    };

    if (isDragging || isDraggingBrightness) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, isDraggingBrightness]);

  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = rgbToHex(r, g, b);

  const wheelCanvas = (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="cursor-crosshair touch-none rounded-full"
      onMouseDown={handleColorWheelMouseDown}
      onMouseMove={handleColorWheelMouseMove}
      onMouseUp={handleColorWheelMouseUp}
      onMouseLeave={handleColorWheelMouseUp}
      onPointerDown={handleColorWheelPointerDown}
      onPointerMove={handleColorWheelPointerMove}
      onPointerUp={handleColorWheelPointerUp}
      onPointerLeave={handleColorWheelPointerUp}
      style={{ touchAction: 'none', width: size, height: size }}
    />
  );

  const brightnessCanvas = (
    <canvas
      ref={brightnessRef}
      width={compact ? 14 : 20}
      height={size}
      className="cursor-ns-resize touch-none rounded"
      onMouseDown={handleBrightnessMouseDown}
      onMouseMove={handleBrightnessMouseMove}
      onMouseUp={handleBrightnessMouseUp}
      onMouseLeave={handleBrightnessMouseUp}
      onPointerDown={handleBrightnessPointerDown}
      onPointerMove={handleBrightnessPointerMove}
      onPointerUp={handleBrightnessPointerUp}
      onPointerLeave={handleBrightnessPointerUp}
      style={{ touchAction: 'none', width: compact ? 14 : 20, height: size }}
    />
  );

  if (compact) {
    return (
      <div className="flex gap-1.5 items-start">
        {wheelCanvas}
        {brightnessCanvas}
      </div>
    );
  }

  return (
    <div className="absolute z-[9999] bg-white dark:bg-gray-800 border-2 border-black dark:border-white p-2 shadow-lg retro-window">
      <div className="flex gap-2 items-start">
        {wheelCanvas}
        {brightnessCanvas}
        <div className="flex flex-col gap-2 min-w-[120px]">
          <div className="flex flex-col gap-1">
            <div
              className="w-full h-12 border-2 border-black dark:border-white"
              style={{ backgroundColor: hex }}
            />
            <input
              type="text"
              value={hex.toUpperCase()}
              onChange={(e) => {
                const next = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(next)) {
                  const rgb = hexToRgb(next);
                  const nextHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                  setHsv(nextHsv);
                  onColorChangeRef.current(next.toLowerCase());
                }
              }}
              className="w-full px-2 py-1 text-xs border-2 border-black dark:border-white bg-white dark:bg-gray-700 text-black dark:text-white font-mono"
            />
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="pixel-border-button px-2 py-1 text-xs bg-black text-white dark:bg-white dark:text-black"
            >
              {t('common.confirm')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

