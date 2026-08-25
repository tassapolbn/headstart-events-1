import type { FormField } from '@/lib/types';
import { isStoredFileRef } from '@/lib/storage';
import { Field, Input, Select, Textarea } from '@/components/ui/inputs';
import { Button } from '@/components/ui/basics';
import { ExternalLink } from 'lucide-react';

/**
 * Edit one registration answer using the same control type as the original
 * question, respecting its options and validation. Keeps the stored value in
 * the shape the public form produced, so nothing downstream breaks.
 */
export function AnswerEditor({ field, value, onChange, onOpenFile }: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
  onOpenFile?: (path: string) => void;
}) {
  const label = field.label;

  switch (field.type) {
    case 'dropdown':
    case 'radio':
    case 'multiple_choice': {
      const current = typeof value === 'string' ? value : '';
      const known = (field.options ?? []).includes(current);
      return (
        <Field label={label}>
          <Select value={known ? current : (current ? '__custom__' : '')} onChange={(e) => onChange(e.target.value === '__custom__' ? current : e.target.value)} aria-label={label}>
            <option value="">Not answered</option>
            {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            {current && !known && <option value="__custom__">{current} (custom)</option>}
          </Select>
        </Field>
      );
    }

    case 'checkboxes': {
      const arr: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field label={label}>
          <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
            {(field.options ?? []).map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={arr.includes(o)}
                  onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))}
                  className="h-4 w-4 rounded accent-navy-700"
                />
                {o}
              </label>
            ))}
          </div>
        </Field>
      );
    }

    case 'menu_quantity': {
      const counts: Record<string, number> = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, number>) : {};
      return (
        <Field label={label}>
          <div className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
            {(field.options ?? []).map((o) => (
              <div key={o} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{o}</span>
                <Input
                  type="number" min={0} className="w-20"
                  value={counts[o] ?? 0}
                  onChange={(e) => {
                    const n = Math.max(0, Number(e.target.value) || 0);
                    const next = { ...counts };
                    if (n === 0) delete next[o]; else next[o] = n;
                    onChange(next);
                  }}
                  aria-label={`${label}: ${o} quantity`}
                />
              </div>
            ))}
          </div>
        </Field>
      );
    }

    case 'paragraph':
      return (
        <Field label={label}>
          <Textarea rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );

    case 'number':
      return (
        <Field label={label} hint={field.validation ? [field.validation.min !== undefined ? `min ${field.validation.min}` : '', field.validation.max !== undefined ? `max ${field.validation.max}` : ''].filter(Boolean).join(', ') || undefined : undefined}>
          <Input type="number" min={field.validation?.min} max={field.validation?.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );

    case 'date':
      return (
        <Field label={label}>
          <Input type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );

    case 'time':
      return (
        <Field label={label}>
          <Input type="time" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );

    case 'email':
      return (
        <Field label={label}>
          <Input type="email" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );

    case 'phone':
      return (
        <Field label={label}>
          <Input type="tel" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );

    case 'file':
    case 'photo':
    case 'signature': {
      if (isStoredFileRef(value)) {
        return (
          <Field label={label}>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => onOpenFile?.(value.path)}>
                {value.name}
              </Button>
              <button type="button" onClick={() => onChange(null)} className="text-xs text-red-500 hover:underline">Remove</button>
            </div>
          </Field>
        );
      }
      return (
        <Field label={label} hint="Uploaded by the registrant on the public form.">
          <p className="text-sm text-slate-400">No file uploaded.</p>
        </Field>
      );
    }

    // short_text and anything else
    default:
      return (
        <Field label={label}>
          <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}
