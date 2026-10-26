/**
 * 图片工具函数
 * 用于处理图片格式转换、尺寸调整、压缩等操作
 */

/**
 * 将Base64或Blob URL转换为Blob
 */
export async function convertImageToBlob(image: string): Promise<Blob> {
  if (image.startsWith('data:')) {
    // Base64格式
    const response = await fetch(image);
    return await response.blob();
  } else if (image.startsWith('blob:')) {
    // Blob URL格式
    const response = await fetch(image);
    return await response.blob();
  } else {
    // 假设是URL，尝试获取
    const response = await fetch(image);
    return await response.blob();
  }
}

/**
 * 调整图片尺寸（保持宽高比）
 */
export function resizeImageForAI(
  image: Blob,
  maxWidth: number,
  maxHeight: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(image);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // 计算新尺寸（保持宽高比）
      let { width, height } = img;
      const aspectRatio = width / height;
      
      if (width > maxWidth) {
        width = maxWidth;
        height = width / aspectRatio;
      }
      
      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspectRatio;
      }
      
      // 创建canvas并绘制
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('无法创建canvas上下文'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('图片转换失败'));
          }
        },
        'image/png',
        0.95
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    
    img.src = url;
  });
}

/**
 * 图片转Base64（支持格式转换）
 */
export function imageToBase64(image: Blob, format: string = 'image/png'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    
    reader.onerror = () => {
      reject(new Error('图片读取失败'));
    };
    
    // 如果格式不同，先转换
    if (image.type !== format) {
      const img = new Image();
      const url = URL.createObjectURL(image);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('无法创建canvas上下文'));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const reader2 = new FileReader();
              reader2.onload = () => resolve(reader2.result as string);
              reader2.onerror = () => reject(new Error('图片转换失败'));
              reader2.readAsDataURL(blob);
            } else {
              reject(new Error('图片转换失败'));
            }
          },
          format,
          0.95
        );
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片加载失败'));
      };
      
      img.src = url;
    } else {
      reader.readAsDataURL(image);
    }
  });
}

/** 影格生图参考图单张上限（二进制体积） */
export const AI_REF_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 估算 data URL 对应的二进制字节数
 */
export function estimateDataUrlBytes(dataUrl: string): number {
  if (!dataUrl) return 0;
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // base64 → 字节约 3/4；忽略少量 padding 误差
  return Math.floor((b64.replace(/\s/g, '').length * 3) / 4);
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

function canvasToJpegDataUrl(
  img: HTMLImageElement,
  maxSide: number,
  quality: number
): string {
  let { width, height } = img;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建canvas上下文');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 将图片压缩到不超过 maxBytes（默认 2MB）。
 * 已够小则原样返回；过大则缩放边长 + 降低 JPEG 质量。
 */
export async function compressImageUnderMaxBytes(
  image: string,
  maxBytes: number = AI_REF_IMAGE_MAX_BYTES
): Promise<string> {
  if (!image) return image;
  // 已是 data URL 且体积合规则不改，避免无谓画质损失
  if (image.startsWith('data:') && estimateDataUrlBytes(image) <= maxBytes) {
    return image;
  }

  const blob = await convertImageToBlob(image);
  if (image.startsWith('data:') && blob.size <= maxBytes) {
    return image;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadHtmlImage(objectUrl);
    let maxSide = Math.min(2048, Math.max(img.width, img.height));
    let best = '';

    for (let round = 0; round < 12; round++) {
      for (let q = 0.88; q >= 0.45; q -= 0.08) {
        const dataUrl = canvasToJpegDataUrl(img, maxSide, q);
        best = dataUrl;
        if (estimateDataUrlBytes(dataUrl) <= maxBytes) {
          return dataUrl;
        }
      }
      maxSide = Math.round(maxSide * 0.75);
      if (maxSide < 512) break;
    }

    return best || image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * 压缩图片到指定大小（KB）
 */
export async function compressImage(
  image: Blob,
  maxSizeKB: number
): Promise<Blob> {
  const maxSizeBytes = maxSizeKB * 1024;

  // 如果图片已经小于目标大小，直接返回
  if (image.size <= maxSizeBytes) {
    return image;
  }

  const dataUrl = await imageToBase64(image, image.type || 'image/png');
  const compressed = await compressImageUnderMaxBytes(dataUrl, maxSizeBytes);
  return convertImageToBlob(compressed);
}

/**
 * 根据画幅比例计算图片尺寸
 */
export function calculateImageSize(
  aspectRatio: string,
  baseSize: number = 1024
): { width: number; height: number } {
  const [wStr, hStr] = aspectRatio.split(':');
  const w = parseFloat(wStr || '16');
  const h = parseFloat(hStr || '9');
  const ratio = w / h;
  
  let width: number;
  let height: number;
  
  if (w >= h) {
    // 横向或正方形
    width = baseSize;
    height = Math.round(baseSize / ratio);
  } else {
    // 纵向
    height = baseSize;
    width = Math.round(baseSize * ratio);
  }
  
  // 确保尺寸是8的倍数（某些API要求）
  width = Math.round(width / 8) * 8;
  height = Math.round(height / 8) * 8;
  
  return { width, height };
}

/**
 * 计算安全框边界（与 DrawingCanvas 中的逻辑一致）
 */
function calculateFrameBounds(
  canvasWidth: number,
  canvasHeight: number,
  aspectRatio: string
): { x: number; y: number; width: number; height: number } {
  if (!aspectRatio) {
    return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  }
  
  const [wStr, hStr] = aspectRatio.split(':');
  const aspect = parseFloat(hStr || '9') === 0 ? 16 / 9 : parseFloat(wStr || '16') / parseFloat(hStr || '9');

  let frameWidth = canvasWidth;
  let frameHeight = canvasWidth / aspect;

  if (frameHeight > canvasHeight) {
    frameHeight = canvasHeight;
    frameWidth = canvasHeight * aspect;
  }

  const x = (canvasWidth - frameWidth) / 2;
  const y = (canvasHeight - frameHeight) / 2;

  return { x, y, width: frameWidth, height: frameHeight };
}

/**
 * 裁剪图片到安全框内
 * 只有安全框内的内容才是分镜展示的内容
 * 
 * @param image - base64 或 URL 格式的图片
 * @param aspectRatio - 项目的画幅比例，例如 "16:9"
 * @param canvasWidth - 可选，如果提供则使用指定尺寸作为画布宽度
 * @param canvasHeight - 可选，如果提供则使用指定尺寸作为画布高度
 * @returns 裁剪后的 base64 图片
 */
export function cropToSafeFrame(
  image: string,
  aspectRatio: string,
  canvasWidth?: number,
  canvasHeight?: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // 处理跨域问题
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // 使用图片的实际尺寸或提供的尺寸
        const width = canvasWidth || img.width;
        const height = canvasHeight || img.height;
        
        // 计算安全框边界
        const frameBounds = calculateFrameBounds(width, height, aspectRatio);
        
        // 创建临时 canvas，尺寸为安全框大小
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.round(frameBounds.width);
        tempCanvas.height = Math.round(frameBounds.height);
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) {
          reject(new Error('无法创建canvas上下文'));
          return;
        }
        
        // 绘制裁剪后的内容
        tempCtx.drawImage(
          img,
          frameBounds.x, frameBounds.y, frameBounds.width, frameBounds.height,
          0, 0, frameBounds.width, frameBounds.height
        );
        
        // 返回 base64 数据
        const croppedImage = tempCanvas.toDataURL('image/png');
        resolve(croppedImage);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('裁剪图片失败'));
      }
    };
    
    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };
    
    // 设置图片源
    img.src = image;
  });
}

