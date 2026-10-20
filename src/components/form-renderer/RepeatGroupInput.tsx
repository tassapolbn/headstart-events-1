import { Plus, X } from 'lucide-react';
import type { FormField, SubField } from '@/lib/types';
import { addLabel, itemLabelOf, repeatEntries, repeatMax, repeatMin, type RepeatEntry } from '@/lib/repeatGroup';
import { cn } from '@/lib/utils';

/**
 * The same few details asked for each child, sibling or guest. With "Add
 * another" people add entries one by one; with "how many" they type a number
 * and that many entries appear.
 */
export function RepeatGroupInput({ field, value, onChange, onBlur, invalid, inputClassName }: {
  field: FormField;
  value: unknown;
  onChange: (value: RepeatEntry[] | undefined) => void;
  onBlur?: () => void;
  invalid?: boolean;
  inputClassName: string;
}) {
  const entries = repeatEntries(value);
  const list = entries ?? [];
  const counted = field.countMode === 'number';
  const label = itemLabelOf(field);
  const max = repeatMax(field);
  const subs = field.subFields ?? [];

  function setCount(raw: string) {
    if (raw.trim() === '') { onChange(undefined); return; }
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const count = Math.max(0, Math.min(max, n));
    onChange(Array.from({ length: count }, (_, i) => list[i] ?? {}));
  }
  const setDetail = (i: number, id: string, v: string) => onChange(list.map((e, j) => (j === i ? { ...e, [id]: v } : e)));
  const canRemove = !counted && list.length > Math.max(repeatMin(field), field.required ? 1 : 0);

  function control(s: SubField, i: number) {
    const id = `${field.id}-${i}-${s.id}`;
    const common = {
      id, onBlur, className: inputClassName,
      value: list[i]?.[s.id] ?? '',
      'aria-required': !!s.required,
    };
    if (s.type === 'dropdown') {
      return (
        <select {...common} onChange={(e) => setDetail(i, s.id, e.target.value)}>
          <option value="">{s.placeholder || 'Please select'}</option>
          {(s.options ?? []).filter((o) => o.trim()).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (s.type === 'paragraph') {
      return <textarea {...common} rows={2} placeholder={s.placeholder} onChange={(e) => setDetail(i, s.id, e.target.value)} />;
    }
    return (
      <input
        {...common}
        type={s.type === 'number' ? 'number' : s.type === 'date' ? 'date' : 'text'}
        inputMode={s.type === 'number' ? 'numeric' : undefined}
        placeholder={s.placeholder}
        onChange={(e) => setDetail(i, s.id, e.target.value)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {counted && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-28 shrink-0">
            <input
              id={field.id} type="number" min={0} max={max} inputMode="numeric"
              className={inputClassName}
              value={entries ? String(list.length) : ''}
              onChange={(e) => setCount(e.target.value)} onBlur={onBlur}
              aria-invalid={invalid} aria-describedby={`${field.id}-count-hint`}
            />
          </div>
          <span id={`${field.id}-count-hint`} className="text-xs opacity-70">
            {list.length > 0 ? `Please add the details for each ${label.toLowerCase()} below.` : `Enter a number from 0 to ${max}.`}
          </span>
        </div>
      )}

      {list.map((_, i) => (
        <div key={i} role="group" aria-labelledby={`${field.id}-${i}-title`} className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <p id={`${field.id}-${i}-title`} className="text-sm font-bold" style={{ color: 'var(--ev-heading, #142e49)' }}>
              {label} {i + 1}
            </p>
            {canRemove && (
              <button type="button" onClick={() => onChange(list.filter((__, j) => j !== i))}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${label} ${i + 1}`}>
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {subs.map((s, k) => (
              <div key={s.id} className={cn('space-y-1', (s.type === 'paragraph' || (subs.length % 2 === 1 && k === 0)) && 'sm:col-span-2')}>
                <label htmlFor={`${field.id}-${i}-${s.id}`} className="block text-sm font-medium">
                  {s.label}
                  {s.required && <span className="ml-0.5" style={{ color: 'var(--ev-primary, #1a3c5e)' }} aria-hidden="true">*</span>}
                </label>
                {control(s, i)}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!counted && list.length < max && (
        <button
          type="button" onClick={() => onChange([...list, {}])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm font-semibold transition hover:opacity-80"
          style={{ borderColor: 'var(--ev-primary, #1a3c5e)', color: 'var(--ev-primary, #1a3c5e)' }}
        >
          <Plus className="h-4 w-4" /> {addLabel(field, list.length === 0)}
        </button>
      )}
    </div>
  );
}
