import type { EventRecord, Registration } from './types';
import { formatDate, formatTimeRange } from './utils';

/**
 * Replace {{MergeFields}} in email subjects and bodies.
 * Supported: {{Name}} {{Booth}} {{Event}} {{Date}} {{Time}} {{Location}} {{ReferenceNumber}}
 */
export function buildMergeMap(
  event: Pick<EventRecord, 'name' | 'event_date' | 'start_time' | 'end_time' | 'location'>,
  reg: { name?: string | null; reference?: string; boothLabel?: string | null }
): Record<string, string> {
  return {
    name: reg.name || 'Guest',
    booth: reg.boothLabel || 'Not applicable',
    event: event.name,
    date: formatDate(event.event_date) || 'To be announced',
    time: formatTimeRange(event.start_time, event.end_time) || 'To be announced',
    location: event.location || 'HeadStart International School Phuket',
    referencenumber: reg.reference || '',
  };
}

export function renderMergeFields(template: string, map: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (whole, key: string) => {
    const v = map[key.toLowerCase()];
    return v !== undefined ? v : whole;
  });
}

export function mergeMapForRegistration(event: EventRecord, reg: Registration): Record<string, string> {
  return buildMergeMap(event, {
    name: reg.name,
    reference: reg.reference,
    boothLabel: reg.booths ? `${reg.booths.label} ${reg.booths.number}`.trim() : null,
  });
}

export const MERGE_FIELDS = ['{{Name}}', '{{Booth}}', '{{Event}}', '{{Date}}', '{{Time}}', '{{Location}}', '{{ReferenceNumber}}'];
