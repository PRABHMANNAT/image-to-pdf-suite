import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  RotateCw,
  Copy,
  Trash2,
  Check,
  X as XIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';

export type Rotation = 0 | 90 | 180 | 270;

export interface SelectablePage {
  id: string;
  pageNumber: number;
  thumbDataUrl: string;
  selected: boolean;
  rotation?: Rotation;
}

export interface EditablePage {
  id: string;
  /** 1-based source page number used when generating the output PDF. */
  sourcePageNumber: number;
  thumbDataUrl: string;
  rotation: Rotation;
}

interface CommonProps {
  className?: string;
}

interface SelectionProps extends CommonProps {
  mode: 'selection';
  pages: SelectablePage[];
  onToggle: (id: string) => void;
  /** Drives the colour of selected thumbs — "remove" tools use red. */
  highlight?: 'add' | 'remove';
  /** Optional: toggle every page at once via the header bar. */
  onToggleAll?: (selectAll: boolean) => void;
}

interface EditableProps extends CommonProps {
  mode: 'editable';
  pages: EditablePage[];
  onReorder: (next: EditablePage[]) => void;
  onRotate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

type Props = SelectionProps | EditableProps;

function SelectableTile({
  page,
  onToggle,
  highlight,
}: {
  page: SelectablePage;
  onToggle: (id: string) => void;
  highlight: 'add' | 'remove';
}) {
  const ringColor =
    highlight === 'remove'
      ? page.selected
        ? 'ring-red-500/80 shadow-[0_0_0_3px_rgba(239,68,68,0.25)]'
        : 'ring-transparent'
      : page.selected
        ? 'ring-brand-500/80 shadow-glow'
        : 'ring-transparent';
  return (
    <button
      type="button"
      onClick={() => onToggle(page.id)}
      className={cn(
        'group relative rounded-xl overflow-hidden border bg-white dark:bg-slate-900 ring-2 transition outline-none focus-visible:ring-brand-500/60',
        'border-slate-200/80 dark:border-white/10',
        ringColor,
      )}
      aria-pressed={page.selected}
      aria-label={`Page ${page.pageNumber}${page.selected ? ' (selected)' : ''}`}
    >
      <div
        className={cn(
          'aspect-[3/4] bg-slate-100 dark:bg-white/5 grid place-items-center overflow-hidden',
          page.selected && highlight === 'remove' && 'opacity-50',
        )}
      >
        <img
          src={page.thumbDataUrl}
          alt={`Page ${page.pageNumber}`}
          className="max-w-full max-h-full object-contain"
          style={page.rotation ? { transform: `rotate(${page.rotation}deg)` } : undefined}
        />
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-medium border-t border-slate-200/80 dark:border-white/10">
        <span>Page {page.pageNumber}</span>
        {page.selected ? (
          highlight === 'remove' ? (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
              <XIcon size={12} /> remove
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
              <Check size={12} /> selected
            </span>
          )
        ) : null}
      </div>
    </button>
  );
}

function EditableTile({
  page,
  onRotate,
  onDuplicate,
  onDelete,
}: {
  page: EditablePage;
  onRotate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
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
        'group relative rounded-xl overflow-hidden border bg-white dark:bg-slate-900',
        'border-slate-200/80 dark:border-white/10',
        isDragging && 'ring-2 ring-brand-500/60 shadow-glow z-10',
      )}
    >
      <div className="aspect-[3/4] bg-slate-100 dark:bg-white/5 grid place-items-center overflow-hidden">
        <img
          src={page.thumbDataUrl}
          alt={`Source page ${page.sourcePageNumber}`}
          className="max-w-full max-h-full object-contain"
          style={page.rotation ? { transform: `rotate(${page.rotation}deg)` } : undefined}
        />
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-medium border-t border-slate-200/80 dark:border-white/10">
        <span className="truncate">
          Page {page.sourcePageNumber}
          {page.rotation ? <span className="text-slate-500"> · {page.rotation}°</span> : null}
        </span>
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

      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          type="button"
          aria-label="Rotate"
          onClick={() => onRotate(page.id)}
          className="rounded-md bg-slate-900/70 text-white p-1 hover:bg-brand-600/80"
        >
          <RotateCw size={13} />
        </button>
        <button
          type="button"
          aria-label="Duplicate"
          onClick={() => onDuplicate(page.id)}
          className="rounded-md bg-slate-900/70 text-white p-1 hover:bg-indigo-600/80"
        >
          <Copy size={13} />
        </button>
        <button
          type="button"
          aria-label="Delete page"
          onClick={() => onDelete(page.id)}
          className="rounded-md bg-slate-900/70 text-white p-1 hover:bg-red-600/80"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export function PdfPageGrid(props: Props) {
  if (props.mode === 'selection') {
    const { pages, onToggle, highlight = 'add', onToggleAll, className } = props;
    const allSelected = pages.length > 0 && pages.every((p) => p.selected);
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{pages.length} pages</span>
          {onToggleAll && (
            <button
              type="button"
              className="hover:text-brand-600 dark:hover:text-brand-400"
              onClick={() => onToggleAll(!allSelected)}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {pages.map((p) => (
            <SelectableTile key={p.id} page={p} onToggle={onToggle} highlight={highlight} />
          ))}
        </div>
      </div>
    );
  }

  const { pages, onReorder, onRotate, onDuplicate, onDelete, className } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = pages.findIndex((p) => p.id === active.id);
    const newIdx = pages.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const copy = [...pages];
    const [moved] = copy.splice(oldIdx, 1);
    copy.splice(newIdx, 0, moved);
    onReorder(copy);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
        <div
          className={cn(
            'grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
            className,
          )}
        >
          {pages.map((p) => (
            <EditableTile
              key={p.id}
              page={p}
              onRotate={onRotate}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
