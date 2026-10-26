import { Shot } from '../../../types';
import { useProjectStore } from '../../../store/projectStore';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';
import { cropToSafeFrame } from '../../../utils/imageUtils';
import { isAndroidApp, pickAndroidShotImage } from '../../../utils/pickAndroidImage';

interface BoardShotCardProps {
  shot: Shot;
  isActive: boolean;
  isSelected: boolean;
  onClick: (e?: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
  onDuplicate?: (e: React.MouseEvent) => void;
  onUnbind?: (e: React.MouseEvent) => void;
}

export function BoardShotCard({
  shot,
  isActive,
  isSelected,
  onClick,
  onDoubleClick,
  onDelete,
  onDuplicate,
  onUnbind,
}: BoardShotCardProps) {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  const updateShot = useProjectStore((state) => state.updateShot);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // 计算图片容器的宽高比样式
  const imageContainerStyle = useMemo(() => {
    const ratioString = project?.aspectRatio || '16:9';
    const [wStr, hStr] = ratioString.split(':');
    const w = parseFloat(wStr || '16');
    const h = parseFloat(hStr || '9');
    
    const style: React.CSSProperties = {
      width: '100%',
      backgroundColor: 'var(--ui-surface-muted, #f3f4f6)',
      overflow: 'hidden',
    };
    
    // 使用 aspect-ratio 让容器根据项目比例自适应高度
    (style as any).aspectRatio = `${w} / ${h}`;
    
    return style;
  }, [project?.aspectRatio]);

  const applyImageDataUrl = async (result: string) => {
    if (project?.aspectRatio) {
      try {
        const croppedImage = await cropToSafeFrame(result, project.aspectRatio);
        updateShot(shot.id, {
          image: croppedImage,
          imageSource: 'upload',
        });
        return;
      } catch (error) {
        console.error('裁剪图片失败:', error);
      }
    }
    updateShot(shot.id, {
      image: result,
      imageSource: 'upload',
    });
  };

  // 处理文件选择
  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert(t('shot.upload.imageOnly') || '请选择图片文件');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) void applyImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  // 处理拖拽上传
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // 安卓上弹出相册/拍照；网页仍用文件选择
  const handleUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isAndroidApp()) {
      void (async () => {
        try {
          const dataUrl = await pickAndroidShotImage({
            title: t('shot.upload.cameraTitle'),
            gallery: t('shot.upload.fromGallery'),
            camera: t('shot.upload.takePhoto'),
            cancel: t('shot.upload.cancel'),
          });
          if (dataUrl) await applyImageDataUrl(dataUrl);
        } catch (error) {
          console.error('打开相机或相册失败:', error);
          alert(t('shot.upload.cameraFailed'));
        }
      })();
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // 重置input，允许重复选择同一文件
    e.target.value = '';
  };
  
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`retro-window cursor-pointer overflow-hidden bg-white dark:bg-gray-900 ${
        isActive ? 'ring-2 ring-primary' : ''
      } ${
        isSelected ? 'ring-2 ring-offset-2 ring-black dark:ring-white' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-b-2 border-black dark:border-white">
        <span className="board-shot-kicker">#{shot.shotNumber}</span>
        <span className="board-shot-kicker truncate text-right">
          {shot.framing} / {shot.cameraAngle}
        </span>
      </div>
      <div
        style={imageContainerStyle}
        className={`relative group flex items-center justify-center ${
          isDragging ? 'ring-2 ring-inset ring-black dark:ring-white' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {shot.image ? (
          <img
            src={shot.image}
            alt={`Shot ${shot.shotNumber}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 text-sm gap-2 px-2">
            <span>{t('shot.noImage')}</span>
            <button
              onClick={handleUploadClick}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="pixel-border-button min-h-10 px-3 py-1 text-sm bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 relative z-10"
              style={{ pointerEvents: 'auto' }}
            >
              {t('shot.upload.image') || '上传图片'}
            </button>
          </div>
        )}
        {isSelected && (onDelete || onDuplicate || onUnbind) && (
          <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-2 z-20 max-w-[90%]">
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="pixel-border-button min-h-8 px-2 py-1 text-sm bg-white dark:bg-gray-900"
                title={t('shot.duplicate') || '复制'}
                style={{ pointerEvents: 'auto' }}
              >
                {t('shot.duplicate') || '复制'}
              </button>
            )}
            {onUnbind && (
              <button
                onClick={onUnbind}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="pixel-border-button min-h-8 px-2 py-1 text-sm bg-white dark:bg-gray-900"
                title={t('shot.unbind') || '解绑'}
                style={{ pointerEvents: 'auto' }}
              >
                {t('shot.unbind') || '解绑'}
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="pixel-border-button min-h-8 px-2 py-1 text-sm bg-white dark:bg-gray-900"
                title={t('shot.delete') || '删除'}
                style={{ pointerEvents: 'auto' }}
              >
                {t('shot.delete') || '删除'}
              </button>
            )}
          </div>
        )}
        {shot.image && (
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 [@media(hover:none)]:bg-opacity-20 transition-opacity duration-150 flex items-center justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 pointer-events-none">
            <button
              onClick={handleUploadClick}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="pixel-border-button min-h-10 px-3 py-1 text-sm bg-white text-black hover:bg-gray-100 relative z-10"
              style={{ pointerEvents: 'auto' }}
            >
              {t('shot.upload.replace') || '更换图片'}
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {(shot.duration > 0 || shot.notes) && (
        <div className="px-2 py-2 border-t-2 border-black dark:border-white">
          {shot.duration > 0 && (
            <p className="board-shot-caption">{shot.duration}{t('common.secondsShort')}</p>
          )}
          {shot.notes && (
            <p className="board-shot-caption line-clamp-3 mt-1">{shot.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}




