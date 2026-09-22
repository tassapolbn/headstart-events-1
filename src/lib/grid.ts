import type { FormField } from './types';

/** 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 11 -> 11th, 22 -> 22nd */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function isGridField(f: Pick<FormField, 'type'>): boolean {
  return f.type === 'grid' || f.type === 'checkbox_grid' || f.type === 'ranking';
}

/** Rows (the things being answered) of a grid or ranking question. */
export function gridRows(f: FormField): string[] {
  if (f.type === 'ranking') return f.options ?? [];
  return f.rows ?? [];
}

/** Columns (the possible answers) of a grid or ranking question. */
export function gridColumns(f: FormField): string[] {
  if (f.type === 'ranking') return (f.options ?? []).map((_, i) => ordinal(i + 1));
  return f.options ?? [];
}

/** Each column may be used once only: always for ranking, optional for a multiple choice grid. */
export function limitOnePerColumn(f: FormField): boolean {
  return f.type === 'ranking' || (f.type === 'grid' && !!f.onePerColumn);
}

export type GridAnswer = Record<string, string | string[]>;

/** Human readable lines, in row order: "Academic progress: 1st". */
export function gridAnswerLines(f: FormField, value: unknown): Array<{ row: string; answer: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const v = value as GridAnswer;
  let rows = gridRows(f);
  if (f.type === 'ranking') {
    // Present a ranking in rank order: 1st first.
    const cols = gridColumns(f);
    rows = [...rows].sort((a, b) => {
      const ia = cols.indexOf(String(v[a] ?? '')), ib = cols.indexOf(String(v[b] ?? ''));
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }
  return rows
    .map((row) => {
      const a = v[row];
      const answer = Array.isArray(a) ? a.join(', ') : String(a ?? '');
      return { row, answer };
    })
    .filter((l) => l.answer !== '');
}

/** Validation shared by the public form: returns an error message or null. */
export function gridError(f: FormField, value: unknown): string | null {
  const v = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as GridAnswer;
  const rows = gridRows(f);
  const cols = gridColumns(f);
  const answered = (row: string) => {
    const a = v[row];
    return Array.isArray(a) ? a.length > 0 : !!a;
  };
  for (const row of rows) {
    const a = v[row];
    const list = Array.isArray(a) ? a : a ? [a] : [];
    if (list.some((x) => !cols.includes(x))) return 'Please select one of the available answers.';
  }
  if (f.required && rows.some((r) => !answered(r))) {
    return f.type === 'ranking' ? 'Please give every item a rank.' : 'Please answer every row.';
  }
  if (limitOnePerColumn(f)) {
    const used = rows.map((r) => v[r]).filter((x): x is string => typeof x === 'string' && x !== '');
    if (new Set(used).size !== used.length) {
      return f.type === 'ranking' ? 'Each rank can be used once only.' : 'Please choose each column once only.';
    }
  }
  return null;
}
