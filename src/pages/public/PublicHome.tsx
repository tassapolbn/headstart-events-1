import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, CalendarDays, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Campus, EventRecord } from '@/lib/types';
import { formatDate, formatTimeRange } from '@/lib/utils';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formCopy } from '@/lib/formCopy';
import { filterPublicEvents, eventAvailability } from '@/lib/publicEvents';
import { Input, Select } from '@/components/ui/inputs';
import { PageLoader } from '@/components/ui/basics';

/**
 * The campus name above each group of events.
 *
 * The event list is pulled up over the navy header, so the first of these
 * lands on navy rather than on the page below it. Its text is navy too, which
 * made it disappear completely. The heading therefore carries its own white
 * surface and never depends on what is behind it.
 */
export function CampusHeading({ campus }: { campus: Pick<Campus, 'name' | 'school_name' | 'accent'> }) {
  return (
    <div className="inline-flex max-w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 shadow-card">
      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: campus.accent }} />
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold leading-tight text-navy-800">{campus.name}</h2>
        {campus.school_name && <p className="text-xs text-slate-500">{campus.school_name}</p>}
      </div>
    </div>
  );
}

export default function PublicHome() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const settings = useAppSettings();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [campusFilter, setCampusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState('');
  const filteredEvents = useMemo(() => filterPublicEvents(events, query, campusFilter, typeFilter), [events, query, campusFilter, typeFilter]);

  useEffect(() => {
    Promise.all([
      supabase.from('events').select('*').in('status', ['published', 'open', 'waitlist']).order('event_date', { ascending: true, nullsFirst: false }),
      supabase.from('campuses').select('*').order('sort_order'),
    ]).then(([ev, cp]) => {
      if (ev.error || cp.error) setError('We could not load the events. Please try again.');
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
      .map((c) => ({ campus: c, list: filteredEvents.filter((e) => (e.campus_id ?? 'hsc') === c.id) }))
      .filter((g) => g.list.length > 0)
      .map((g) => ({ ...g, showHeadings }));
  }, [events, filteredEvents, campuses]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-navy-800 px-4 pb-20 pt-12 text-center text-white">
        <img src={settings?.email_logo_url ?? settings?.logo_url ?? '/logo.svg'} alt="School logo" className="mx-auto h-20 w-auto max-w-[82vw] object-contain sm:h-24" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">Connect with our school community</p>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Events and Forms</h1>
        <p className="mt-1.5 text-navy-100">Upcoming school events, surveys and feedback forms</p>
        <Link to="/lookup" className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-navy-100 hover:bg-white/20">
          <Search className="h-4 w-4" /> Find my registration
        </Link>
      </header>

      <section className="relative mx-auto -mt-8 max-w-6xl space-y-8 px-4 pb-16" aria-label="Browse events and forms">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800"><SlidersHorizontal className="h-4 w-4" />Find an event or form</div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input type="search" className="py-2.5 pl-10" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or location" aria-label="Search events and forms" /></div>
            <Select aria-label="Filter by campus" value={campusFilter} onChange={e => setCampusFilter(e.target.value)}><option value="">All campuses</option>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Select aria-label="Filter by form type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">All form types</option><option value="registration">Events</option><option value="survey">Surveys and feedback</option></Select>
          </div>
          {!loading && !error && <p className="mt-3 text-xs text-slate-500" role="status">{filteredEvents.length} {filteredEvents.length === 1 ? 'result' : 'results'}{(query || campusFilter || typeFilter) && <button type="button" onClick={() => { setQuery(''); setCampusFilter(''); setTypeFilter(''); }} className="ml-3 font-semibold text-navy-700 underline">Clear filters</button>}</p>}
        </div>
        {error ? <div role="alert" className="rounded-2xl bg-white p-8 text-center"><p>{error}</p><button type="button" className="mt-3 font-semibold text-navy-700 underline" onClick={() => window.location.reload()}>Try again</button></div> : loading ? (
          <PageLoader label="Loading events" />
        ) : filteredEvents.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="font-medium text-slate-700">{events.length ? 'No matching events or forms.' : 'No events or forms are open right now.'}</p>
            <p className="mt-1 text-sm text-slate-500">{events.length ? 'Try another search or clear your filters.' : 'Please check back soon.'}</p>
          </div>
        ) : (
          groups.map(({ campus, list, showHeadings }) => (
            <div key={campus.id} className="space-y-4">
              {showHeadings && <CampusHeading campus={campus} />}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.4) }}
                  >
                    <Link
                      to={`/e/${e.slug}`}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-navy-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy-200"
                    >
                      <div
                        className="h-40 bg-navy-700 bg-cover bg-center"
                        style={
                          e.branding?.banner_url || e.branding?.poster_url
                            ? { backgroundImage: `url(${e.branding.banner_url ?? e.branding.poster_url})` }
                            : { background: `linear-gradient(120deg, ${e.theme?.primary ?? '#1a3c5e'}, ${e.theme?.accent ?? '#2f5d8a'})` }
                        }
                      />
                      <div className="flex flex-1 flex-col items-start gap-3 p-5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{formCopy(e).typeLabel}</span>
                        <h3 className="font-display text-lg font-semibold text-navy-800">{e.name}</h3>
                        {(!formCopy(e).isSurvey || e.event_date) && (
                          <p className="flex items-center gap-1.5 text-sm text-slate-500">
                            <CalendarDays className="h-4 w-4 shrink-0" />
                            {e.event_date ? formatDate(e.event_date, 'EEE d MMM yyyy') : 'Date to be announced'}
                            {formatTimeRange(e.start_time, e.end_time) && `, ${formatTimeRange(e.start_time, e.end_time)}`}
                          </p>
                        )}
                        {e.location && (
                          <p className="flex items-center gap-1.5 text-sm text-slate-500">
                            <MapPin className="h-4 w-4 shrink-0" /> {e.location}
                          </p>
                        )}
                        <span className="mt-auto inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-2 text-xs font-semibold text-navy-800">
                          {eventAvailability(e) === 'closed' ? 'Closed' : eventAvailability(e) === 'upcoming' ? 'Opening soon' : formCopy(e).isSurvey ? formCopy(e).homeBadge : e.status === 'waitlist' ? 'Waitlist open' : 'Register now'}<ArrowUpRight className="h-3.5 w-3.5" />
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
