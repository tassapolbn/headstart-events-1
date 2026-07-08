import type { EventRecord } from './types';

function icsDate(date: string, time?: string | null): string {
  const t = (time ?? '09:00').replace(':', '');
  return `${date.replace(/-/g, '')}T${t}00`;
}

/** Build a calendar invitation (.ics) for an event. */
export function buildIcs(event: Pick<EventRecord, 'name' | 'description' | 'event_date' | 'start_time' | 'end_time' | 'location'>, reference?: string): string | null {
  if (!event.event_date) return null;
  const uidStr = `${reference ?? 'event'}-${event.event_date}@headstart-events`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HeadStart Events//EN',
    'BEGIN:VEVENT',
    `UID:${uidStr}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${icsDate(event.event_date, event.start_time)}`,
    `DTEND:${icsDate(event.event_date, event.end_time ?? event.start_time)}`,
    `SUMMARY:${event.name.replace(/[,;]/g, ' ')}`,
    `LOCATION:${(event.location || 'HeadStart International School Phuket').replace(/[,;]/g, ' ')}`,
    reference ? `DESCRIPTION:Registration reference ${reference}` : 'DESCRIPTION:HeadStart school event',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
