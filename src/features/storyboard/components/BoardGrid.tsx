import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot } from '../../../types';
import { useProjectStore } from '../../../store/projectStore';
import { BoardShotCard } from './BoardShotCard';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../../i18n/useTranslation';
import { parseShotNumber, resolveRootId } from '../../../utils/shotNumbering';

function isCopyShot(shot: Shot, all: Shot[]): boolean {
  if (shot.parentShotId && resolveRootId(shot, all) !== shot.id) {
    return true;
  }
  const parsed = parseShotNumber(shot.shotNumber);
  if (!parsed.suffix) return false;
  return all.some((s) => {
    if (s.id === shot.id) return false;
    const p = parseShotNumber(s.shotNumber);
    return !p.suffix && p.main === parsed.main;
  });
}

interface BoardGridProps {
  shots: Shot[];
  activeShotId: string | null;
  onShotClick: (shotId: string) => void;
  onShotDoubleClick: (shotId: string) => void;
}

export function BoardGrid({
  shots,
  activeShotId,
  onShotClick,
  onShotDoubleClick,
}: BoardGridProps) {
  const { t } = useTranslation();
  const reorderShotsByDrag = useProjectStore((state) => state.reorderShotsByDrag);
  const deleteShot = useProjectStore((state) => state.deleteShot);
  const duplicateShot = useProjectStore((state) => state.duplicateShot);
  const unbindShot = useProjectStore((state) => state.unbindShot);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartTimeRef = useRef<number>(0);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const justDraggedRef = useRef<boolean>(false);

  // 根据设备类型动态调整拖拽参数
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 优化触控笔支持
      activationConstraint: {
        // 对于触控笔，使用较小的距离阈值（3px）以提高灵敏度
        // 对于鼠标，也使用较小的阈值以保持一致性
        distance: 3,
        // 减小延迟，提高响应速度
        delay: 0, // 移除延迟，让触控笔操作更直接
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    dragStartTimeRef.current = Date.now();
    // 记录拖拽开始位置
    if (event.activatorEvent instanceof PointerEvent) {
      dragStartPosRef.current = {
        x: event.activatorEvent.clientX,
        y: event.activatorEvent.clientY,
      };
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setIsDragging(false);

    if (over && active.id !== over.id) {
      // 主镜头与复制镜头成组移动，并按主序号重排（1、1b、2…）
      reorderShotsByDrag(String(active.id), String(over.id));
      // 标记刚刚完成拖拽
      justDraggedRef.current = true;
      // 延迟重置，避免点击事件触发
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
    }
    
    // 重置拖拽状态
    dragStartTimeRef.current = 0;
    dragStartPosRef.current = null;
  };

  // 处理镜头点击（区分点击和拖拽）
  const handleShotClick = (shotId: string, e?: React.MouseEvent) => {
    // 如果正在拖拽或刚刚完成拖拽，不触发点击选择
    if (isDragging || justDraggedRef.current) {
      return;
    }
    
    // 如果点击的是已选中的镜头，取消选择
    if (selectedShotId === shotId) {
      setSelectedShotId(null);
    } else {
      setSelectedShotId(shotId);
      onShotClick(shotId);
    }
  };

  // 处理删除
  const handleDelete = (shotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个镜头吗？')) {
      deleteShot(shotId);
      setSelectedShotId(null);
    }
  };

  // 处理复制
  const handleDuplicate = (shotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newShotId = duplicateShot(shotId);
    if (!newShotId) {
      alert(t('sidebar.createShotFailed'));
      return;
    }
    setSelectedShotId(newShotId);
    onShotClick(newShotId);
  };

  // 解绑复制镜头（成为独立主镜头）
  const handleUnbind = (shotId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    unbindShot(shotId);
  };

  // 点击空白区域取消选择
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 如果点击的不是卡片区域，也不是操作按钮，取消选择
      if (!target.closest('[data-shot-card]') && 
          !target.closest('button') &&
          !target.closest('input')) {
        setSelectedShotId(null);
      }
    };

    if (selectedShotId) {
      // 延迟添加监听器，避免立即触发
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [selectedShotId]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={shots.map((s) => s.id)} strategy={rectSortingStrategy}>
        <div className="board-grid">
          {shots.map((shot) => (
            <SortableShotCard
              key={shot.id}
              shot={shot}
              isActive={shot.id === activeShotId}
              isSelected={shot.id === selectedShotId}
              onClick={(e) => handleShotClick(shot.id, e)}
              onDoubleClick={() => onShotDoubleClick(shot.id)}
              onDelete={(e) => handleDelete(shot.id, e)}
              onDuplicate={(e) => handleDuplicate(shot.id, e)}
              onUnbind={
                isCopyShot(shot, shots)
                  ? (e) => handleUnbind(shot.id, e)
                  : undefined
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableShotCardProps {
  shot: Shot;
  isActive: boolean;
  isSelected: boolean;
  onClick: (e?: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onUnbind?: (e: React.MouseEvent) => void;
}

function SortableShotCard({
  shot,
  isActive,
  isSelected,
  onClick,
  onDoubleClick,
  onDelete,
  onDuplicate,
  onUnbind,
}: SortableShotCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: shot.id,
    // 确保拖拽功能启用
    disabled: false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition, // 拖拽时禁用过渡动画，更流畅
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 1000 : 'auto', // 拖拽时提升层级
    cursor: isDragging ? 'grabbing' : 'pointer', // 改为pointer，表示可点击
    touchAction: 'none', // 禁用触摸默认行为，确保拖拽正常工作
  };

  // 创建一个包装的监听器，在拖拽开始前检测点击
  const wrappedListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      const startX = e.clientX;
      const startY = e.clientY;
      let hasMoved = false;

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);
        if (deltaX > 5 || deltaY > 5) {
          hasMoved = true;
        }
      };

      const handleUp = () => {
        if (!hasMoved) {
          // 没有移动，触发点击选择
          onClick(e as any);
        }
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };

      // 先调用原始的拖拽监听器
      if (listeners?.onPointerDown) {
        listeners.onPointerDown(e);
      }

      // 如果移动距离很小，认为是点击
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
    },
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes}
      {...wrappedListeners}
      onDoubleClick={onDoubleClick}
      className={isDragging ? 'shadow-2xl' : ''} // 拖拽时添加阴影效果
      data-shot-card // 用于点击外部检测
    >
      <BoardShotCard
        shot={shot}
        isActive={isActive}
        isSelected={isSelected}
        onClick={() => {}} // 点击由外层处理
        onDoubleClick={() => {}} // 双击由外层处理
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onUnbind={onUnbind}
      />
    </div>
  );
}











