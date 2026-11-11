import type { EventRecord, EventSettings, FormField, Registration } from './types';

type MoveEvent = Pick<EventRecord, 'id' | 'name' | 'campus_id' | 'status'> & {
  settings?: Partial<EventSettings> | null;
};

export function pickTargetEvents<T extends MoveEvent>(events: T[], currentEvent: MoveEvent, campusId: string): T[] {
  const name = currentEvent.name.trim().toLowerCase();
  const formType = currentEvent.settings?.formType ?? 'registration';
  return events
    .filter((e) => e.campus_id === campusId && e.id !== currentEvent.id && (e.settings?.formType ?? 'registration') === formType)
    .sort((a, b) => Number(b.name.trim().toLowerCase() === name) - Number(a.name.trim().toLowerCase() === name) || a.name.localeCompare(b.name));
}

export function missingAnswerFields(data: Record<string, unknown> | null | undefined, targetFormSchema: Pick<FormField, 'id'>[]): string[] {
  const ids = new Set(targetFormSchema.map((f) => f.id));
  function hasAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (typeof value === 'string') return !!value.trim();
    if (Array.isArray(value)) return value.some(hasAnswer);
    if (typeof value === 'object') return Object.values(value).some(hasAnswer);
    return true;
  }
  // Policy acknowledgements live under __policy_acks, alongside other internal keys.
  return Object.keys(data ?? {}).filter((id) => !id.startsWith('__') && !ids.has(id) && hasAnswer(data?.[id]));
}

export async function moveRegistration(reg: Registration, targetEvent: MoveEvent): Promise<{ releasedBooths: boolean }> {
  const { supabase } = await import('./supabase');
  const email = reg.email?.trim().toLowerCase();
  if (!targetEvent.settings?.allowDuplicateEmail && email) {
    // Compare in JS to trim stored emails too; paginate past the API's row limit.
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('registrations').select('email')
        .eq('event_id', targetEvent.id).not('status', 'in', '(cancelled,rejected)')
        .order('id').range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      if (data?.some((r) => r.email?.trim().toLowerCase() === email)) {
        throw new Error('This email already has a registration for that event.');
      }
      if (!data || data.length < pageSize) break;
    }
  }

  let releasedBooths = !!reg.booth_id || !!reg.registration_booths?.length;
  if (!releasedBooths) {
    const { data, error } = await supabase.from('registration_booths').select('booth_id').eq('registration_id', reg.id).limit(1);
    if (error) throw new Error(error.message);
    releasedBooths = !!data?.length;
  }
  if (releasedBooths) {
    const { error } = await supabase.rpc('admin_release_registration_booths', { p_reg_id: reg.id });
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from('registrations').update({ event_id: targetEvent.id, checked_in_at: null }).eq('id', reg.id);
  if (error) {
    throw new Error(releasedBooths
      ? `Booths were released, but the move failed: ${error.message}. The registration is still in its original event; reassign its booth if needed.`
      : error.message);
  }
  return { releasedBooths };
}
