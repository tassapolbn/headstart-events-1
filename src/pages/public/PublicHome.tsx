import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, MapPin, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Campus, EventRecord } from '@/lib/types';
import { formatDate, formatTimeRange } from '@/lib/utils';
import { useAppSettings } from '@/hooks/useAppSettings';
import { PageLoader } from '@/components/ui/basics';

export default function PublicHome() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const settings = useAppSettings();

  useEffect(() => {
    Promise.all([
      supabase.from('events').select('*').in('status', ['published', 'open', 'waitlist']).order('event_date', { ascending: true, nullsFirst: false }),
      supabase.from('campuses').select('*').order('sort_order'),
    ]).then(([ev, cp]) => {
      setEvents((ev.data ?? []) as EventRecord[]);
      setCampuses((cp.data ?? []) as Campus[]);
      setLoading(false);
    });
  }, []);

  // Group events under their campus, only showing campuses that have events.
  const groups = useMemo(() => {
    const order = campuses.length ? campuses : [{ id: 'hsc', name: '', accent: '#1a3c5e' } as Campus];
    const showHeadings = campuses.length > 1 && new Set(events.map((e) => e.campus_id)).size > 1;
    return order
      .map((c) => ({ campus: c, list: events.filter((e) => (e.campus_id ?? 'hsc') === c.id) }))
      .filter((g) => g.list.length > 0)
      .map((g) => ({ ...g, showHeadings }));
  }, [events, campuses]);

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="bg-navy-800 pb-16 pt-10 text-center text-white">
        <img src={settings?.email_logo_url ?? settings?.logo_url ?? '/logo.svg'} alt="School logo" className="mx-auto h-20 w-auto max-w-[82vw] object-contain sm:h-24" />
        <h1 className="mt-5 font-display text-3xl font-bold sm:text-4xl">Event Registration</h1>
        <p className="mt-1.5 text-navy-100">Register for our upcoming school events</p>
        <Link to="/lookup" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-navy-100 hover:bg-white/20">
          <Search className="h-4 w-4" /> Find my registration
        </Link>
      </header>

      <section className="mx-auto -mt-8 max-w-5xl space-y-8 px-4 pb-16">
        {loading ? (
          <PageLoader label="Loading events" />
        ) : events.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="font-medium text-slate-700">No events are open for registration right now.</p>
            <p className="mt-1 text-sm text-slate-500">Please check back soon.</p>
          </div>
        ) : (
          groups.map(({ campus, list, showHeadings }) => (
            <div key={campus.id} className="space-y-4">
              {showHeadings && (
                <div className="flex items-center gap-3">
                  <span className="h-6 w-1.5 rounded-full" style={{ background: campus.accent }} />
                  <div>
                    <h2 className="font-display text-lg font-bold text-navy-800">{campus.name}</h2>
                    <p className="text-xs text-slate-500">{campus.school_name}</p>
                  </div>
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.4) }}
                  >
                    <Link
                      to={`/e/${e.slug}`}
                      className="block h-full overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <div
                        className="h-32 bg-navy-700 bg-cover bg-center"
                        style={
                          e.branding?.banner_url || e.branding?.poster_url
                            ? { backgroundImage: `url(${e.branding.banner_url ?? e.branding.poster_url})` }
                            : { background: `linear-gradient(120deg, ${e.theme?.primary ?? '#1a3c5e'}, ${e.theme?.accent ?? '#2f5d8a'})` }
                        }
                      />
                      <div className="space-y-2 p-4">
                        <h3 className="font-display text-lg font-semibold text-navy-800">{e.name}</h3>
                        <p className="flex items-center gap-1.5 text-sm text-slate-500">
                          <CalendarDays className="h-4 w-4 shrink-0" />
                          {e.event_date ? formatDate(e.event_date, 'EEE d MMM yyyy') : 'Date to be announced'}
                          {formatTimeRange(e.start_time, e.end_time) && `, ${formatTimeRange(e.start_time, e.end_time)}`}
                        </p>
                        {e.location && (
                          <p className="flex items-center gap-1.5 text-sm text-slate-500">
                            <MapPin className="h-4 w-4 shrink-0" /> {e.location}
                          </p>
                        )}
                        <span className="inline-block rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-gold-800">
                          {e.status === 'waitlist' ? 'Waitlist open' : 'Register now'}
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <footer className="pb-8 text-center text-xs text-slate-400">
        <Link to="/admin" className="hover:underline">Staff sign in</Link>
      </footer>
    </main>
  );
}
