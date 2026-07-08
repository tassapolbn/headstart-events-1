import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, CalendarPlus, Copy, FileBarChart2, Globe2, PencilRuler, Shapes, Users } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { EventRecord, Registration } from '@/lib/types';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, PageLoader, StatCard } from '@/components/ui/basics';

const statusColor: Record<string, 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'purple'> = {
  draft: 'gray', published: 'blue', open: 'green', closed: 'red', waitlist: 'amber',
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [recent, setRecent] = useState<Array<Registration & { events: { name: string } | null }>>([]);
  const [totalRegs, setTotalRegs] = useState(0);
  const [trendRows, setTrendRows] = useState<Array<{ created_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const since = subDays(new Date(), 13).toISOString().slice(0, 10);
      const [ev, rec, total, trend] = await Promise.all([
        supabase.from('events').select('*').order('event_date', { ascending: true, nullsFirst: false }),
        supabase.from('registrations').select('*, events(name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('registrations').select('id', { count: 'exact', head: true }),
        supabase.from('registrations').select('created_at').gte('created_at', since),
      ]);
      setEvents((ev.data ?? []) as EventRecord[]);
      setRecent((rec.data ?? []) as Array<Registration & { events: { name: string } | null }>);
      setTotalRegs(total.count ?? 0);
      setTrendRows((trend.data ?? []) as Array<{ created_at: string }>);
      setLoading(false);
    }
    void load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(
    () => events.filter((e) => e.status !== 'draft' && e.event_date && e.event_date >= today),
    [events, today]
  );
  const drafts = events.filter((e) => e.status === 'draft');
  const published = events.filter((e) => ['published', 'open', 'waitlist'].includes(e.status));
  const past = events.filter((e) => e.event_date && e.event_date < today);

  const trend = useMemo(() => {
    const days: Array<{ day: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        day: format(d, 'd MMM'),
        count: trendRows.filter((r) => r.created_at.slice(0, 10) === key).length,
      });
    }
    return days;
  }, [trendRows]);

  if (loading) return <PageLoader label="Loading your dashboard" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Everything happening across your school events.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => navigate('/admin/events?new=1')}>
            Create New Event
          </Button>
          <Button variant="outline" icon={<Shapes className="h-4 w-4" />} onClick={() => navigate('/admin/templates')}>
            View Templates
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Upcoming Events" value={upcoming.length} icon={<CalendarDays className="h-5 w-5" />} tone="navy" />
        <StatCard label="Published Events" value={published.length} icon={<Globe2 className="h-5 w-5" />} tone="green" />
        <StatCard label="Draft Events" value={drafts.length} icon={<PencilRuler className="h-5 w-5" />} tone="slate" hint={`${past.length} past`} />
        <StatCard label="Total Registrations" value={totalRegs} icon={<Users className="h-5 w-5" />} tone="gold" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Registration trend, last 14 days" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a3c5e" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#1a3c5e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Registrations" stroke="#1a3c5e" strokeWidth={2} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Quick actions">
          <div className="grid gap-2">
            <Button variant="outline" className="justify-start" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => navigate('/admin/events?new=1')}>Create New Event</Button>
            <Button variant="outline" className="justify-start" icon={<Copy className="h-4 w-4" />} onClick={() => navigate('/admin/events')}>Duplicate an Event</Button>
            <Button variant="outline" className="justify-start" icon={<Shapes className="h-4 w-4" />} onClick={() => navigate('/admin/templates')}>View Templates</Button>
            <Button variant="outline" className="justify-start" icon={<FileBarChart2 className="h-4 w-4" />} onClick={() => navigate('/admin/events')}>View Reports</Button>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming events" actions={<Link to="/admin/events" className="text-xs font-medium text-navy-600 hover:underline">View all</Link>}>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming events" hint="Create an event and publish it to see it here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/admin/events/${e.id}`} className="block truncate text-sm font-medium text-navy-700 hover:underline">{e.name}</Link>
                    <p className="text-xs text-slate-500">{formatDate(e.event_date, 'EEE d MMM yyyy')} {e.location && `- ${e.location}`}</p>
                  </div>
                  <Badge color={statusColor[e.status]}>{e.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent registrations">
          {recent.length === 0 ? (
            <EmptyState title="No registrations yet" hint="Registrations appear here as soon as they arrive." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{r.name ?? 'Unnamed'} <span className="text-xs font-normal text-slate-400">({r.reference})</span></p>
                    <p className="truncate text-xs text-slate-500">{r.events?.name ?? ''} - {formatDateTime(r.created_at)}</p>
                  </div>
                  <Badge color={r.status === 'confirmed' ? 'green' : r.status === 'waitlist' ? 'amber' : r.status === 'pending' ? 'blue' : 'gray'}>
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
