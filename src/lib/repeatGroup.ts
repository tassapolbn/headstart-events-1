import type { FormField } from './types';
import { uid } from './utils';

/**
 * Repeating questions: the same few details asked once per child, sibling or
 * guest. Answers are stored as a list with one entry per person, each entry
 * mapping a detail's id to the text typed, e.g.
 *   [{ name: 'Ann', year: 'Year 3' }, { name: 'Tom', year: 'Year 5' }]
 */
export type RepeatEntry = Record<string, string>;

export const YEAR_GROUPS = ['Nursery', 'Reception', ...Array.from({ length: 13 }, (_, i) => `Year ${i + 1}`)];

/** Ready to use settings: a child list (Add another), or a "how many" count with an age each. */
export function defaultRepeatGroup(mode: 'add' | 'number' = 'add'): Partial<FormField> {
  if (mode === 'number') {
    return { countMode: 'number', itemLabel: 'Child', minItems: undefined, maxItems: 10,
      subFields: [{ id: uid(), label: 'Age', type: 'number', required: true }] };
  }
  return {
    countMode: 'add', itemLabel: 'Child', minItems: 1, maxItems: 6,
    subFields: [
      { id: uid(), label: 'Full name', type: 'short_text', required: true },
      { id: uid(), label: 'Year', type: 'dropdown', required: true, options: [...YEAR_GROUPS] },
      { id: uid(), label: 'Class', type: 'short_text', placeholder: 'e.g. 3A' },
    ],
  };
}

export function itemLabelOf(f: Pick<FormField, 'itemLabel'>): string {
  return f.itemLabel?.trim() || 'Entry';
}

/** "Add another child" / "Add an entry". */
export function addLabel(f: Pick<FormField, 'itemLabel'>, first: boolean): string {
  const word = itemLabelOf(f).toLowerCase();
  return first ? `Add ${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}` : `Add another ${word}`;
}

export function repeatMax(f: Pick<FormField, 'maxItems' | 'countMode'>): number {
  const fallback = f.countMode === 'number' ? 10 : 6;
  return Math.max(1, Math.min(50, Math.floor(f.maxItems ?? fallback) || fallback));
}

/** Fewest entries needed: only when the question is required. */
export function repeatMin(f: Pick<FormField, 'minItems' | 'maxItems' | 'countMode' | 'required'>): number {
  if (!f.required || f.countMode === 'number') return 0;
  return Math.max(1, Math.min(repeatMax(f), Math.floor(f.minItems ?? 1) || 1));
}

/** What a new form starts with: one empty entry to fill in, or an empty count. */
export function initialRepeatValue(f: FormField): RepeatEntry[] | undefined {
  if (f.countMode === 'number') return undefined;
  return Array.from({ length: Math.max(1, repeatMin(f)) }, () => ({}));
}

export function repeatEntries(value: unknown): RepeatEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((e) => (e && typeof e === 'object' && !Array.isArray(e) ? e as RepeatEntry : {}));
}

function text(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function isBlankEntry(e: RepeatEntry | undefined): boolean {
  return !e || Object.values(e).every((v) => text(v) === '');
}

/** The first problem to fix, worded for the person filling in the form. */
export function repeatError(f: FormField, value: unknown): string | null {
  const label = itemLabelOf(f);
  const max = repeatMax(f);
  const counted = f.countMode === 'number';
  const entries = repeatEntries(value);
  if (counted && !entries) return f.required ? 'Please enter how many.' : null;
  const list = entries ?? [];
  if (list.length > max) return counted ? `Please enter a number from 0 to ${max}.` : `You can add up to ${max}.`;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    // With "Add another", an untouched extra entry is simply left out.
    if (!counted && isBlankEntry(e)) continue;
    for (const s of f.subFields ?? []) {
      const v = text(e[s.id]);
      if (!v) {
        if (s.required) return `${label} ${i + 1}: please fill in ${s.label}.`;
        continue;
      }
      if (s.type === 'number' && !Number.isFinite(Number(v))) return `${label} ${i + 1}: ${s.label} must be a number.`;
      if (s.type === 'dropdown' && !(s.options ?? []).includes(v)) return `${label} ${i + 1}: please choose ${s.label} from the list.`;
    }
  }
  const min = repeatMin(f);
  if (!counted && list.filter((e) => !isBlankEntry(e)).length < min) {
    return min === 1 ? `Please fill in at least one ${label.toLowerCase()}.` : `Please fill in at least ${min} entries.`;
  }
  return null;
}

/**
 * What is saved: only the form's own details, trimmed. A "how many" answer
 * keeps one entry per counted person (an empty list means 0); otherwise empty
 * entries are dropped and nothing is saved when none are left.
 */
export function cleanRepeatValue(f: FormField, value: unknown): RepeatEntry[] | undefined {
  const entries = repeatEntries(value);
  if (!entries) return undefined;
  const tidy = entries.map((e) => Object.fromEntries(
    (f.subFields ?? []).map((s) => [s.id, text(e[s.id])] as const).filter(([, v]) => v !== '')
  ));
  if (f.countMode === 'number') return tidy.slice(0, repeatMax(f));
  const kept = tidy.filter((e) => Object.keys(e).length > 0);
  return kept.length ? kept : undefined;
}

/** One readable line per entry, e.g. "Child 1: Full name: Ann; Year: Year 3". */
export function repeatLines(f: FormField, value: unknown): string[] {
  const label = itemLabelOf(f);
  return (repeatEntries(value) ?? []).map((e, i) => {
    const parts = (f.subFields ?? [])
      .map((s) => [s.label, text(e[s.id])] as const)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}: ${v}`);
    return `${label} ${i + 1}: ${parts.length ? parts.join('; ') : '(no details)'}`;
  });
}

/** The whole answer as text for exports: the count first for "how many" questions. */
export function formatRepeatValue(f: FormField, value: unknown): string {
  const entries = repeatEntries(value);
  if (!entries) return '';
  const lines = repeatLines(f, entries);
  return (f.countMode === 'number' ? [String(entries.length), ...lines] : lines).join('\n');
}
