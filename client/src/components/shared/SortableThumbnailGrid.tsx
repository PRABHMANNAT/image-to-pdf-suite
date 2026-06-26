import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { humanSize } from '../../lib/fileUtils';

export interface SortableThumb {
  id: string;
  src: string;
  label?: string;
  sublabel?: string;
  /** Raw byte size, optional — drives the size badge. */
  size?: number;
}

interface Props {
  items: SortableThumb[];
  onReorder: (next: SortableThumb[]) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

function SortableTile({
  item,
  onRemove,
}: {
  item: SortableThumb;
  onRemove?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative group rounded-xl overflow-hidden border border-slate-200/80 dark:border-white/10 bg-white dark:bg-slate-900',
        isDragging && 'ring-2 ring-brand-500/60 shadow-glow',
      )}
    >
      <div className="aspect-square bg-slate-100 dark:bg-white/5">
        <img src={item.src} alt={item.label || ''} className="w-full h-full object-cover" />
      </div>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute top-1.5 left-1.5 rounded-md bg-slate-900/70 text-white p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition"
      >
        <GripVertical size={14} />
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label="Remove"
          className="absolute top-1.5 right-1.5 rounded-md bg-slate-900/70 text-white p-1 opacity-0 group-hover:opacity-100 hover:bg-red-600/80 transition"
        >
          <Trash2 size={14} />
        </button>
      )}
      {(item.label || item.sublabel || item.size !== undefined) && (
        <div className="px-2 py-1.5 text-[11px] leading-tight border-t border-slate-200/80 dark:border-white/10">
          {item.label && <div className="font-medium truncate">{item.label}</div>}
          <div className="text-slate-500 dark:text-slate-400 truncate">
            {item.sublabel}
            {item.sublabel && item.size !== undefined ? ' · ' : ''}
            {item.size !== undefined ? humanSize(item.size) : ''}
          </div>
        </div>
      )}
    </div>
  );
}

export function SortableThumbnailGrid({ items, onReorder, onRemove, className }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const copy = [...items];
    const [moved] = copy.splice(oldIdx, 1);
    copy.splice(newIdx, 0, moved);
    onReorder(copy);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={cn('grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5', className)}>
          {items.map((it) => (
            <SortableTile key={it.id} item={it} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
