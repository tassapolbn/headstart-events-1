import type { EventSettings, FormField } from './types';

/** Accept only a normal Google Sheets URL; the file's sharing permissions still apply. */
export function googleSheetId(value: string | undefined): string | null {
  const id = String(value ?? '').trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/[^?#\s]*)?(?:[?#]\S*)?$/)?.[1];
  return id && id !== 'e' ? id : null;
}

/** Copies of an event start without a destination: no sheet link and no tab name. */
export function withoutGoogleSheet<T extends Partial<EventSettings>>(settings: T): Omit<T, 'googleSheetUrl' | 'googleSheetTab'> {
  const { googleSheetUrl: _url, googleSheetTab: _tab, ...rest } = settings;
  return rest;
}

// Keep these helpers aligned with GoogleSheets.gs and free of runtime imports.
// The sheet tests transpile this file alone and check both implementations.

export type SheetContactKey = 'name' | 'email' | 'phone';
export const SHEET_CONTACT_KEYS: SheetContactKey[] = ['name', 'email', 'phone'];

const CONTENT_TYPES = ['heading', 'rich_text', 'callout', 'image', 'divider', 'page_break'];
const DEFAULT_CONTACT_LABELS: Record<SheetContactKey, string> = { name: 'Name', email: 'Email', phone: 'Phone' };
const CONTACT_WORDS: Record<SheetContactKey, RegExp> = {
  name: /name|ชื่อ/i,
  email: /e-?mail|อีเมล/i,
  phone: /phone|mobile|\btel\b|โทร|เบอร์|มือถือ/i,
};

/** Built-in columns in sheet order. The hidden Registration ID always comes first and is not listed. */
export const SHEET_BUILTIN_COLUMNS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'reference', label: 'Reference' },
  { key: 'created_at', label: 'Submitted (UTC)' },
  { key: 'name', label: DEFAULT_CONTACT_LABELS.name },
  { key: 'email', label: DEFAULT_CONTACT_LABELS.email },
  { key: 'phone', label: DEFAULT_CONTACT_LABELS.phone },
  { key: 'booth', label: 'Booth' },
  { key: 'status', label: 'Status' },
];

/** Questions that can become sheet columns: everything except headings, text and picture blocks. */
export function sheetQuestions(fields: FormField[]): FormField[] {
  return (fields ?? []).filter((f) => !!f && !!f.id && !CONTENT_TYPES.includes(f.type));
}

/** Ambiguous mappings stay separate; each question can supply only one contact. */
export function sheetContactSources(fields: FormField[]): Record<SheetContactKey, FormField | null> {
  const questions = sheetQuestions(fields);
  const sources: Record<SheetContactKey, FormField | null> = { name: null, email: null, phone: null };
  const taken = (f: FormField) => SHEET_CONTACT_KEYS.some((k) => sources[k]?.id === f.id);
  const mapped = (key: SheetContactKey) => questions.filter((f) => f.mapTo === key);
  for (const key of SHEET_CONTACT_KEYS) {
    const candidates = mapped(key);
    if (candidates.length === 1) sources[key] = candidates[0];
  }
  if (!mapped('name').length) {
    const first = questions.find((f) => f.type === 'short_text');
    if (first && !first.mapTo && !taken(first)) sources.name = first;
  }
  if (!mapped('email').length) {
    const first = questions.find((f) => f.type === 'email');
    if (first) {
      if (!first.mapTo && !taken(first)) sources.email = first;
    } else {
      const candidates = questions.filter((f) => !f.mapTo && !taken(f)
        && f.type === 'short_text' && CONTACT_WORDS.email.test(f.label ?? ''));
      if (candidates.length === 1) sources.email = candidates[0];
    }
  }
  if (!mapped('phone').length) {
    const candidates = questions.filter((f) => !f.mapTo && !taken(f)
      && (f.type === 'phone' || (f.type === 'short_text' && CONTACT_WORDS.phone.test(f.label ?? ''))));
    if (candidates.length === 1) sources.phone = candidates[0];
  }
  return sources;
}

/** Heading of a contact column: the question's own wording when it already says what it is. */
export function sheetContactLabel(key: SheetContactKey, source: FormField | null): string {
  const label = String(source?.label ?? '').replace(/\s+/g, ' ').trim();
  if (!label) return DEFAULT_CONTACT_LABELS[key];
  return CONTACT_WORDS[key].test(label) ? label : `${DEFAULT_CONTACT_LABELS[key]} — ${label}`;
}

/** Only plain numeric answers can be totalled without losing details. */
export function canTotal(field: Pick<FormField, 'type' | 'collectNames'>): boolean {
  return (field.type === 'number' && !field.collectNames) || field.type === 'slider';
}

/** The tab this event writes to: the name staff typed, else the event name. */
export function sheetTabName(settings: Partial<EventSettings> | undefined, eventName: string): string {
  const clean = (value: unknown) => Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, 100).join('').trim();
  return clean(settings?.googleSheetTab) || clean(eventName) || 'Event';
}

export interface SheetColumnChoice {
  key: string;
  label: string;
  sent: boolean;
  field?: FormField;
  source?: FormField;
  mergedInto?: SheetContactKey;
}

/** The checkboxes reflect the server's contact units and last-column fallback. */
export function sheetColumnChoices(fields: FormField[], settings: Partial<EventSettings>): SheetColumnChoice[] {
  const sources = sheetContactSources(fields);
  const excluded = new Set(settings.googleSheetExclude ?? []);
  const builtins: SheetColumnChoice[] = SHEET_BUILTIN_COLUMNS.map(({ key, label }) => {
    const contact = SHEET_CONTACT_KEYS.find(k => k === key);
    const source = contact ? sources[contact] ?? undefined : undefined;
    return {
      key, label: contact ? sheetContactLabel(contact, source ?? null) : label, source,
      sent: !excluded.has(key) && !(source && excluded.has(`answer:${source.id}`)),
    };
  });
  const questions: SheetColumnChoice[] = sheetQuestions(fields).map(field => {
    const mergedInto = SHEET_CONTACT_KEYS.find(k => sources[k]?.id === field.id);
    return { key: `answer:${field.id}`, label: field.label, field, mergedInto,
      sent: mergedInto ? builtins.find(c => c.key === mergedInto)!.sent : !excluded.has(`answer:${field.id}`) };
  });
  const choices = [...builtins, ...questions];
  if (!choices.some(c => c.sent && !c.mergedInto)) builtins[0].sent = true;
  return choices;
}

/** Change both keys of a contact unit, while keeping at least one visible column. */
export function sheetColumnExclusions(fields: FormField[], settings: Partial<EventSettings>, key: string, sent: boolean): string[] {
  const choices = sheetColumnChoices(fields, settings);
  const choice = choices.find(c => c.key === key);
  const column = choice?.mergedInto ? choices.find(c => c.key === choice.mergedInto) : choice;
  const excluded = new Set(settings.googleSheetExclude ?? []);
  if (!column || (!sent && column.sent && choices.filter(c => c.sent && !c.mergedInto).length === 1)) return Array.from(excluded);
  const keys = [column.key, ...(column.source ? [`answer:${column.source.id}`] : [])];
  for (const member of keys) {
    if (sent) excluded.delete(member);
    else excluded.add(member);
  }
  return Array.from(excluded);
}

export interface SheetEventDestination {
  id: string;
  name: string;
  googleSheetUrl?: string | null;
  googleSheetTab?: string | null;
}

export interface SharedSheetEvent { id: string; name: string; tabName: string }

export function sheetSharedEvents(events: SheetEventDestination[], currentId: string, sheetId: string | null): SharedSheetEvent[] {
  if (!sheetId) return [];
  return events.filter(e => e.id !== currentId && googleSheetId(e.googleSheetUrl ?? undefined) === sheetId)
    .map(e => ({ id: e.id, name: e.name, tabName: sheetTabName({ googleSheetTab: e.googleSheetTab ?? undefined }, e.name) }));
}
