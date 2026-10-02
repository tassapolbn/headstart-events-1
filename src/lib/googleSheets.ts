import type { EventSettings } from './types';

/** Accept only a normal Google Sheets URL; the file's sharing permissions still apply. */
export function googleSheetId(value: string | undefined): string | null {
  const id = String(value ?? '').trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/[^?#\s]*)?(?:[?#]\S*)?$/)?.[1];
  return id && id !== 'e' ? id : null;
}

export function withoutGoogleSheet<T extends Partial<EventSettings>>(settings: T): Omit<T, 'googleSheetUrl'> {
  const { googleSheetUrl: _url, ...rest } = settings;
  return rest;
}
