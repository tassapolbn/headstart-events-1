import { ExternalLink } from 'lucide-react';
import type { FormField } from '@/lib/types';
import { isStoredFileRef } from '@/lib/storage';
import { gridAnswerLines, isGridField } from '@/lib/grid';

/** Answers that read better across the full width of the panel. */
export function isWideAnswer(field: FormField, value: unknown): boolean {
  if (['paragraph', 'checkboxes', 'menu_quantity', 'file', 'photo', 'signature', 'grid', 'checkbox_grid', 'ranking'].includes(field.type)) return true;
  return typeof value === 'string' && value.length > 64;
}

function Empty() {
  return <span className="text-sm italic text-slate-300">Not answered</span>;
}

/**
 * Read-only presentation of one answer. The office spends far more time
 * reading registrations than editing them, so this is the default view: label
 * above, answer below, shaped to the question type instead of a flat string.
 */
export function AnswerView({ field, value, onOpenFile }: {
  field: FormField;
  value: unknown;
  onOpenFile?: (path: string) => void;
}) {
  function body() {
    if (value === null || value === undefined || value === '') return <Empty />;

    const fileRef = isStoredFileRef(value) ? value : null;
    if (fileRef) {
      return (
        <button
          type="button"
          onClick={() => onOpenFile?.(fileRef.path)}
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 transition hover:border-navy-300 hover:bg-navy-50"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{fileRef.name}</span>
        </button>
      );
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return <Empty />;
      return (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v, i) => (
            <span key={i} className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-medium text-navy-700">
              {String(v)}
            </span>
          ))}
        </div>
      );
    }

    if (isGridField(field)) {
      const lines = gridAnswerLines(field, value);
      if (lines.length === 0) return <Empty />;
      return (
        <ul className="space-y-1">
          {lines.map(({ row, answer }) => (
            <li key={row} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 pb-1 text-sm last:border-0">
              <span className="min-w-0 text-slate-700">{row}</span>
              <span className="shrink-0 font-semibold text-navy-700">{answer}</span>
            </li>
          ))}
        </ul>
      );
    }

    if (field.type === 'rating' && typeof value === 'string' && field.ratingIcon && field.ratingIcon !== 'number') {
      const n = Number(value), max = field.options?.length ?? 5;
      const glyph = field.ratingIcon === 'heart' ? '\u2665' : field.ratingIcon === 'thumb' ? '\u{1F44D}' : '\u2605';
      return (
        <p className="text-sm text-slate-800">
          <span className="tracking-wider text-gold-500" aria-hidden="true">{glyph.repeat(Math.max(0, Math.min(n, max)))}</span>
          <span className="ml-2 font-semibold">{value} / {max}</span>
        </p>
      );
    }

    if (typeof value === 'object') {
      const lines = Object.entries(value as Record<string, unknown>)
        .filter(([, n]) => typeof n === 'number' && n > 0);
      if (lines.length === 0) return <Empty />;
      return (
        <ul className="space-y-1">
          {lines.map(([k, n]) => (
            <li key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 pb-1 text-sm last:border-0">
              <span className="min-w-0 truncate text-slate-700">{k}</span>
              <span className="shrink-0 font-semibold tabular-nums text-navy-700">&times; {String(n)}</span>
            </li>
          ))}
        </ul>
      );
    }

    const text = String(value);
    if (field.type === 'email') {
      return <a href={`mailto:${text}`} className="break-all text-sm font-medium text-navy-700 hover:underline">{text}</a>;
    }
    if (field.type === 'phone') {
      return <a href={`tel:${text.replace(/\s+/g, '')}`} className="text-sm font-medium text-navy-700 hover:underline">{text}</a>;
    }
    return <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{text}</p>;
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</p>
      {body()}
    </div>
  );
}
