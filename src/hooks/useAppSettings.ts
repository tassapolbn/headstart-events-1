import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/lib/types';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setSettings((data as AppSettings) ?? null));
  }, []);
  return settings;
}
