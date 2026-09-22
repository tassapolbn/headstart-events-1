import { Heart, Star, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import type { FormField } from '@/lib/types';
import { gridColumns, gridRows, limitOnePerColumn, type GridAnswer } from '@/lib/grid';
import { cn } from '@/lib/utils';

const ICONS = { star: Star, heart: Heart, thumb: ThumbsUp } as const;

/**
 * Rating question. "number" keeps the original numbered boxes; stars, hearts
 * and thumbs fill up to the chosen point, like Google Forms. The stored value
 * is always the point as text ("1" to "10"), so older answers stay valid.
 */
export function RatingInput({ field, value, onChange, onBlur, invalid }: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  const options = field.options ?? [];
  const icon = field.ratingIcon ?? 'number';
  const [hover, setHover] = useState<number | null>(null);
  const selectedIdx = options.indexOf(value);
  const activeIdx = hover ?? selectedIdx;
  const Icon = icon === 'number' ? null : ICONS[icon];
  const n = options.length;
  /* Icons keep to a single row filling the whole width, so the points are
     always evenly spaced. They shrink as the scale grows so ten still fit on
     a phone. Numbered boxes stay readable by wrapping to two rows past six. */
  const cols = Icon ? n : n <= 6 ? n : Math.ceil(n / 2);
  const iconSize = n <= 5 ? 'h-8 w-8 sm:h-10 sm:w-10' : n <= 7 ? 'h-7 w-7 sm:h-9 sm:w-9' : 'h-6 w-6 sm:h-8 sm:w-8';

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={field.label}
        aria-required={!!field.required}
        aria-invalid={invalid}
        className="ev-scale"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0, 1fr))` }}
        onMouseLeave={() => setHover(null)}
      >
        {options.map((o, i) => {
          const checked = value === o;
          const filled = activeIdx >= 0 && i <= activeIdx;
          return Icon ? (
            <label
              key={o}
              className="group flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg py-1 focus-within:ring-2 focus-within:ring-[var(--ev-primary)]"
              onMouseEnter={() => setHover(i)}
            >
              <span className="text-xs opacity-60">{o}</span>
              <input
                type="radio" name={field.id} value={o} checked={checked} className="sr-only"
                onChange={() => onChange(o)} onBlur={onBlur}
                aria-label={`${o} of ${n}`}
              />
              <Icon
                className={cn('transition-transform group-hover:scale-110', iconSize, filled ? '' : 'opacity-40')}
                style={filled ? { color: icon === 'heart' ? '#e11d48' : icon === 'star' ? '#F0B323' : 'var(--ev-primary)', fill: 'currentColor' } : undefined}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </label>
          ) : (
            <label key={o} className="ev-choice w-full justify-center">
              <input
                type="radio" name={field.id} value={o} checked={checked} className="h-4 w-4"
                onChange={() => onChange(o)} onBlur={onBlur}
              />
              {o}
            </label>
          );
        })}
      </div>
      {(field.lowLabel || field.highLabel) && (
        <div className="mt-1.5 flex w-full justify-between gap-4 text-xs opacity-70">
          <span>{field.lowLabel}</span>
          <span className="text-right">{field.highLabel}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Multiple choice grid, checkbox grid and ranking.
 * Wide screens get a table like Google Forms; phones get one card per row
 * so nothing is squashed or cut off.
 */
export function GridInput({ field, value, onChange, onBlur, invalid }: {
  field: FormField;
  value: GridAnswer | undefined;
  onChange: (v: GridAnswer) => void;
  onBlur?: () => void;
  invalid?: boolean;
}) {
  const rows = gridRows(field);
  const cols = gridColumns(field);
  const multi = field.type === 'checkbox_grid';
  const unique = limitOnePerColumn(field);
  const v: GridAnswer = value ?? {};

  function isChecked(row: string, col: string) {
    const a = v[row];
    return Array.isArray(a) ? a.includes(col) : a === col;
  }

  function toggle(row: string, col: string) {
    const next: GridAnswer = { ...v };
    if (multi) {
      const list = Array.isArray(next[row]) ? [...(next[row] as string[])] : [];
      next[row] = list.includes(col) ? list.filter((x) => x !== col) : [...list, col];
      if ((next[row] as string[]).length === 0) delete next[row];
    } else {
      if (next[row] === col) {
        delete next[row];
      } else {
        // One per column: the answer moves here from any other row.
        if (unique) for (const r of Object.keys(next)) if (next[r] === col) delete next[r];
        next[row] = col;
      }
    }
    onChange(next);
  }

  const inputProps = (row: string, col: string, prefix: string) => ({
    type: multi ? 'checkbox' : 'radio',
    name: multi ? undefined : `${prefix}-${field.id}-${row}`,
    checked: isChecked(row, col),
    onChange: () => toggle(row, col),
    // Radios cannot be unticked by clicking, so let a second click clear the row.
    onClick: multi ? undefined : (e: React.MouseEvent<HTMLInputElement>) => { if (isChecked(row, col) && e.detail > 0) { e.preventDefault(); toggle(row, col); } },
    onBlur,
    className: cn('h-5 w-5 cursor-pointer', multi && 'rounded'),
    style: { accentColor: 'var(--ev-primary)' },
  });

  if (rows.length === 0 || cols.length === 0) {
    return <p className="text-xs italic opacity-60">This question has no rows or columns yet.</p>;
  }

  return (
    <div className={cn('ev-grid', cols.length > 6 && 'ev-grid-wide')} role="group" aria-label={field.label} aria-invalid={invalid}>
      {/* Enough room: a table */}
      <div className="ev-grid-table overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="w-[34%]" />
              {cols.map((c) => (
                <th key={c} scope="col" className="px-1 pb-2 text-center text-xs font-medium opacity-80">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r} className={ri % 2 === 0 ? 'bg-slate-50/70' : ''}>
                <th scope="row" className="rounded-l-lg px-3 py-3 text-left font-normal">{r}</th>
                {cols.map((c, ci) => (
                  <td key={c} className={cn('px-1 py-3 text-center', ci === cols.length - 1 && 'rounded-r-lg')}>
                    <input {...inputProps(r, c, 't')} aria-label={`${r}: ${c}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tight space: one card per row */}
      <div className="ev-grid-cards">
        {rows.map((r) => (
          <fieldset key={r} className="rounded-xl border border-slate-200 bg-white p-3">
            <legend className="px-1 text-sm font-medium">{r}</legend>
            <div className="flex flex-wrap gap-2">
              {cols.map((c) => (
                <label key={c} className="ev-chip">
                  <input {...inputProps(r, c, 'm')} className={cn('h-4 w-4', multi && 'rounded')} />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {unique && (
        <p className="mt-2 text-xs opacity-60">
          {field.type === 'ranking' ? 'Each rank can be used once. Choosing a rank again moves it to the new item.' : 'Each column can be chosen once only.'}
        </p>
      )}
    </div>
  );
}
