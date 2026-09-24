import type { EventRecord } from './types';

export function eventAvailability(event: EventRecord, now = Date.now()) {
  if (event.status === 'draft' || event.status === 'closed') return 'closed';
  if (event.reg_opens_at && now < new Date(event.reg_opens_at).getTime()) return 'upcoming';
  if (event.reg_closes_at && now > new Date(event.reg_closes_at).getTime()) return 'closed';
  return event.status === 'waitlist' ? 'waitlist' : 'open';
}

export function filterPublicEvents(events: EventRecord[], query: string, campus: string, type: string) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return events.filter(e => {
    const searchable = `${e.name} ${e.location ?? ''}`.toLocaleLowerCase();
    return (!campus || (e.campus_id ?? 'hsc') === campus)
      && (!type || (e.settings?.formType ?? 'registration') === type)
      && terms.every(term => searchable.includes(term));
  });
}
