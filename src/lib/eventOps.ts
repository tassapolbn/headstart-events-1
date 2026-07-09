import { supabase } from './supabase';
import { newEventDraft } from './defaults';
import type { Booth, EventRecord, TemplateSnapshot } from './types';
import { normalizeEvent } from '@/hooks/useEvent';
import { slugify } from './utils';

/** Fields copied when duplicating an event or saving it as a template. */
function snapshotEventFields(e: EventRecord): Partial<EventRecord> {
  return {
    name: e.name,
    description: e.description,
    location: e.location,
    start_time: e.start_time,
    end_time: e.end_time,
    max_registrations: e.max_registrations,
    branding: e.branding,
    theme: e.theme,
    form_schema: e.form_schema,
    policies: e.policies,
    email_template: e.email_template,
    settings: e.settings,
    floor_plan: e.floor_plan,
  };
}

function snapshotBooth(b: Booth): Omit<Booth, 'id' | 'event_id'> {
  return {
    label: b.label, number: b.number,
    x: b.x, y: b.y, w: b.w, h: b.h, rotation: b.rotation,
    color: b.color,
    // A copied layout starts fresh: booked booths become available again.
    status: b.status === 'booked' ? 'available' : b.status,
    hidden: b.hidden, group_name: b.group_name, notes: b.notes,
    booked_label: null,
    font_size: b.font_size ?? null,
    allowed_types: b.allowed_types ?? null,
  };
}

async function loadEventWithBooths(eventId: string): Promise<{ event: EventRecord; booths: Booth[] }> {
  const { data: event, error } = await supabase.from('events').select('*').eq('id', eventId).single();
  if (error) throw error;
  const { data: booths, error: bErr } = await supabase.from('booths').select('*').eq('event_id', eventId);
  if (bErr) throw bErr;
  return { event: normalizeEvent(event), booths: (booths ?? []) as Booth[] };
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const { data } = await supabase.from('events').select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

async function insertEventWithBooths(
  eventFields: Partial<EventRecord>,
  booths: Array<Omit<Booth, 'id' | 'event_id'>>,
  name: string
): Promise<string> {
  const slug = await uniqueSlug(name);
  const { data: created, error } = await supabase
    .from('events')
    .insert({ ...eventFields, name, slug, status: 'draft', event_date: null, end_date: null, reg_opens_at: null, reg_closes_at: null })
    .select('id')
    .single();
  if (error) throw error;
  const newId = created.id as string;

  if (booths.length > 0) {
    const rows = booths.map((b) => ({ ...b, event_id: newId }));
    const { error: bErr } = await supabase.from('booths').insert(rows);
    if (bErr) throw bErr;
  }
  return newId;
}

export async function duplicateEvent(eventId: string): Promise<string> {
  const { event, booths } = await loadEventWithBooths(eventId);
  return insertEventWithBooths(snapshotEventFields(event), booths.map(snapshotBooth), `Copy of ${event.name}`);
}

export async function saveAsTemplate(eventId: string, name: string, description: string): Promise<void> {
  const { event, booths } = await loadEventWithBooths(eventId);
  const snapshot: TemplateSnapshot = {
    event: snapshotEventFields(event),
    booths: booths.map(snapshotBooth),
  };
  const { error } = await supabase.from('event_templates').insert({ name, description, snapshot });
  if (error) throw error;
}

export async function createFromTemplate(snapshot: TemplateSnapshot, name: string): Promise<string> {
  return insertEventWithBooths(snapshot.event ?? {}, snapshot.booths ?? [], name);
}

export async function createBlankEvent(name: string): Promise<string> {
  const slug = await uniqueSlug(name);
  const { data, error } = await supabase.from('events').insert(newEventDraft(name, slug)).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

export function publicEventUrl(slug: string): string {
  return `${window.location.origin}/e/${slug}`;
}
