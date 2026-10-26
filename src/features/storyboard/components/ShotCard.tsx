import { Shot } from '../../../types';
import { useProjectStore } from '../../../store/projectStore';
import { useMemo } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';

interface ShotCardProps {
  shot: Shot;
  isActive: boolean;
  onClick: () => void;
}

export function ShotCard({ shot, isActive, onClick }: ShotCardProps) {
  const { t } = useTranslation();
  const project = useProjectStore((state) => state.project);
  
  // 检查是否有多个版本
  const hasMultipleVersions = shot.imageVersions && shot.imageVersions.length > 1;
  
  // 计算图片容器的宽高比样式
  const imageContainerStyle = useMemo(() => {
    const ratioString = project?.aspectRatio || '16:9';
    const [wStr, hStr] = ratioString.split(':');
    const w = parseFloat(wStr || '16');
    const h = parseFloat(hStr || '9');
    
    const style: React.CSSProperties = {
      width: '100%',
      backgroundColor: 'var(--ui-surface-muted, #f3f4f6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    };
    
    // 使用 aspect-ratio 让容器根据比例自适应高度
    (style as any).aspectRatio = `${w} / ${h}`;
    
    return style;
  }, [project?.aspectRatio]);
  
  return (
    <div
      onClick={onClick}
      className={`sidebar-item ${isActive ? 'active' : ''}`}
    >
      <div className="flex flex-col gap-1 mb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold" style={{ fontFamily: 'inherit' }}>
            SHOT #{String(shot.shotNumber).padStart(2, '0')}
          </span>
          {hasMultipleVersions && (
            <span className="px-2 py-0.5 text-sm font-bold shot-version-badge">
              {shot.imageVersions?.length || 0}{t('shot.versions')}
            </span>
          )}
        </div>
        <span className="text-sm truncate" style={{ fontFamily: 'inherit' }}>
          {shot.framing} / {shot.cameraAngle}
        </span>
      </div>

      <div style={imageContainerStyle} className="mb-2 shot-thumb-border">
        {shot.image ? (
          <img
            src={shot.image}
            alt={`Shot ${shot.shotNumber}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="text-sm text-gray-500" style={{ fontFamily: 'inherit' }}>{t('shot.noImage')}</span>
        )}
      </div>

      {shot.duration > 0 && (
        <p className="text-sm mb-1" style={{ fontFamily: 'inherit' }}>
          {shot.duration}{t('common.secondsShort')}
        </p>
      )}
      {shot.notes && (
        <p className="font-bold uppercase leading-snug text-sm line-clamp-2">
          {shot.notes}
        </p>
      )}
    </div>
  );
}



