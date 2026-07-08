import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import type { FormField } from '@/lib/types';
import { fieldTypeMeta } from '@/lib/defaults';
import { cn } from '@/lib/utils';

export function SortableFieldCard({ field, selected, onSelect, onDuplicate, onDelete }: {
  field: FormField;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-xl border bg-white px-2 py-2 transition',
        selected ? 'border-navy-500 ring-2 ring-navy-100' : 'border-slate-200 hover:border-slate-300',
        isDragging && 'z-10 opacity-80 shadow-lg'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${field.label}`}
        className="cursor-grab touch-none rounded p-1.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </span>
        <span className="block text-[11px] text-slate-400">
          {fieldTypeMeta[field.type]?.label ?? field.type}
          {field.condition?.fieldId ? ' - conditional' : ''}
          {field.mapTo ? ` - maps to ${field.mapTo}` : ''}
        </span>
      </button>
      <button aria-label={`Duplicate ${field.label}`} onClick={onDuplicate} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <Copy className="h-4 w-4" />
      </button>
      <button aria-label={`Delete ${field.label}`} onClick={onDelete} className="rounded p-1.5 text-red-300 hover:bg-red-50 hover:text-red-500">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
