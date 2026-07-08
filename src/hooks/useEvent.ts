import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { EventRecord } from '@/lib/types';
import { defaultEmailTemplate, defaultFloorPlan, defaultSettings, defaultTheme } from '@/lib/defaults';

/** Fill any missing JSON sections with defaults so older rows never break the UI. */
export function normalizeEvent(row: Record<string, unknown>): EventRecord {
  const e = row as unknown as EventRecord;
  return {
    ...e,
    branding: e.branding ?? {},
    theme: { ...defaultTheme, ...(e.theme ?? {}) },
    form_schema: Array.isArray(e.form_schema) ? e.form_schema : [],
    policies: Array.isArray(e.policies) ? e.policies : [],
    email_template: { ...defaultEmailTemplate, ...(e.email_template ?? {}) },
    settings: { ...defaultSettings, ...(e.settings ?? {}) },
    floor_plan: { ...defaultFloorPlan, ...(e.floor_plan ?? {}) },
  };
}

export function useEvent(id: string | undefined) {
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error: err } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (err) setError(err.message);
    else if (!data) setError('Event not found');
    else setEvent(normalizeEvent(data));
    setLoading(false);
  }, [id]);

  useEffect(() => { void reload(); }, [reload]);

  return { event, setEvent, loading, error, reload };
}
