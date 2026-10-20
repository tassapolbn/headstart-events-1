import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { SubField } from '@/lib/types';
import { YEAR_GROUPS } from '@/lib/repeatGroup';
import { uid } from '@/lib/utils';
import { Input, Select, Textarea } from '@/components/ui/inputs';

const detailTypes: Array<{ value: SubField['type']; label: string }> = [
  { value: 'short_text', label: 'Short answer' },
  { value: 'dropdown', label: 'Dropdown list' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'paragraph', label: 'Paragraph' },
];

/** The details asked for each child, sibling or guest of a repeating question. */
export function SubFieldsEditor({ subFields, onChange }: {
  subFields: SubField[];
  onChange: (subFields: SubField[]) => void;
}) {
  const set = (i: number, patch: Partial<SubField>) => onChange(subFields.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= subFields.length) return;
    const next = [...subFields];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">Details asked for each one</span>
      {subFields.map((s, i) => (
        <div key={s.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
          <div className="flex items-center gap-1.5">
            <Input value={s.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="e.g. Full name" aria-label={`Detail ${i + 1} name`} />
            <button type="button" aria-label={`Move detail ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" aria-label={`Move detail ${i + 1} down`} disabled={i === subFields.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" aria-label={`Remove detail ${i + 1}`} onClick={() => onChange(subFields.filter((_, j) => j !== i))} className="rounded p-1 text-red-300 hover:text-red-500"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select aria-label={`Detail ${i + 1} type`} value={s.type} className="w-auto"
              onChange={(e) => set(i, { type: e.target.value as SubField['type'], options: e.target.value === 'dropdown' ? (s.options?.length ? s.options : ['Option 1', 'Option 2']) : undefined })}>
              {detailTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded" checked={!!s.required} onChange={(e) => set(i, { required: e.target.checked })} />
              Required
            </label>
          </div>
          {s.type === 'dropdown' ? (
            <div className="space-y-1">
              <Textarea rows={4} value={(s.options ?? []).join('\n')} aria-label={`Detail ${i + 1} choices`}
                onChange={(e) => set(i, { options: e.target.value.split('\n') })} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">One choice per line.</span>
                <button type="button" onClick={() => set(i, { options: [...YEAR_GROUPS] })} className="text-[11px] font-medium text-navy-600 hover:underline">
                  Use year groups (Nursery to Year 13)
                </button>
              </div>
            </div>
          ) : s.type !== 'date' && (
            <Input value={s.placeholder ?? ''} onChange={(e) => set(i, { placeholder: e.target.value || undefined })}
              placeholder="Example shown in the box (optional), e.g. 3A" aria-label={`Detail ${i + 1} example`} />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...subFields, { id: uid(), label: '', type: 'short_text' }])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-navy-300 hover:text-navy-600"
      >
        <Plus className="h-3.5 w-3.5" /> Add a detail
      </button>
    </div>
  );
}
