import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, MapPin, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventRecord } from '@/lib/types';
import { formatDate, formatTimeRange } from '@/lib/utils';
import { useAppSettings } from '@/hooks/useAppSettings';
import { PageLoader } from '@/components/ui/basics';

export default function PublicHome() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const settings = useAppSettings();

  useEffect(() => {
    supabase
      .from('events')
      .select('*')
      .in('status', ['published', 'open', 'waitlist'])
      .order('event_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        setEvents((data ?? []) as EventRecord[]);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="bg-navy-800 pb-16 pt-10 text-center text-white">
        <img src={settings?.logo_url ?? '/logo.svg'} alt="School logo" className="mx-auto h-16 w-16 rounded-2xl object-contain" />
        <h1 className="mt-4 font-display text-3xl font-bold">HeadStart Events</h1>
        <p className="mt-1 text-navy-100">{settings?.school_name ?? 'HeadStart International School Phuket'}</p>
        <Link to="/lookup" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-navy-100 hover:bg-white/20">
          <Search className="h-4 w-4" /> Find my registration
        </Link>
      </header>

      <section className="mx-auto -mt-8 max-w-5xl px-4 pb-16">
        {loading ? (
          <PageLoader label="Loading events" />
        ) : events.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="font-medium text-slate-700">No events are open for registration right now.</p>
            <p className="mt-1 text-sm text-slate-500">Please check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e, i) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  to={`/e/${e.slug}`}
                  className="block overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
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
                    <h2 className="font-display text-lg font-semibold text-navy-800">{e.name}</h2>
                    <p className="flex items-center gap-1.5 text-sm text-slate-500">
                      <CalendarDays className="h-4 w-4" />
                      {e.event_date ? formatDate(e.event_date, 'EEE d MMM yyyy') : 'Date to be announced'}
                      {formatTimeRange(e.start_time, e.end_time) && `, ${formatTimeRange(e.start_time, e.end_time)}`}
                    </p>
                    {e.location && (
                      <p className="flex items-center gap-1.5 text-sm text-slate-500">
                        <MapPin className="h-4 w-4" /> {e.location}
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
        )}
      </section>

      <footer className="pb-8 text-center text-xs text-slate-400">
        <Link to="/admin" className="hover:underline">Staff sign in</Link>
      </footer>
    </main>
  );
}
