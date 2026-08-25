import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Campus } from '@/lib/types';

interface CampusValue {
  campuses: Campus[];
  campusId: string;
  campus: Campus | null;
  setCampusId: (id: string) => void;
  loading: boolean;
  reload: () => Promise<void>;
}

const CampusContext = createContext<CampusValue>({
  campuses: [],
  campusId: 'hsc',
  campus: null,
  setCampusId: () => {},
  loading: true,
  reload: async () => {},
});

const STORAGE_KEY = 'hs:campus';

function normalize(row: Record<string, unknown>): Campus {
  return {
    id: String(row.id),
    name: String(row.name ?? row.id),
    school_name: String(row.school_name ?? 'HeadStart International School'),
    logo_url: (row.logo_url as string) ?? null,
    email_logo_url: (row.email_logo_url as string) ?? null,
    webhook_url: (row.webhook_url as string) ?? null,
    notify_emails: Array.isArray(row.notify_emails) ? (row.notify_emails as string[]) : [],
    accent: String(row.accent ?? '#1a3c5e'),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export function CampusProvider({ children }: { children: ReactNode }) {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusId, setCampusIdState] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'hsc'; } catch { return 'hsc'; }
  });
  const [loading, setLoading] = useState(true);

  async function reload() {
    const { data } = await supabase.from('campuses').select('*').order('sort_order');
    const list = (data ?? []).map(normalize);
    setCampuses(list);
    // Keep the selected campus valid.
    if (list.length > 0 && !list.some((c) => c.id === campusId)) {
      setCampusIdState(list[0].id);
    }
    setLoading(false);
  }

  useEffect(() => { void reload(); }, []);

  function setCampusId(id: string) {
    setCampusIdState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  }

  const campus = useMemo(() => campuses.find((c) => c.id === campusId) ?? null, [campuses, campusId]);

  return (
    <CampusContext.Provider value={{ campuses, campusId, campus, setCampusId, loading, reload }}>
      {children}
    </CampusContext.Provider>
  );
}

export function useCampus() {
  return useContext(CampusContext);
}

/** Fetch a single campus row on demand (used by public pages that know the event's campus). */
export async function fetchCampus(id: string): Promise<Campus | null> {
  const { data } = await supabase.from('campuses').select('*').eq('id', id).maybeSingle();
  return data ? normalize(data) : null;
}
