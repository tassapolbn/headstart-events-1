import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend as ChartLegend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowLeft, Download } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { Booth, Registration } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { boothStatusMeta } from '@/lib/boothColors';
import { download } from '@/lib/utils';
import { Button, Card, EmptyState, PageLoader, StatCard } from '@/components/ui/basics';

const COLORS = ['#1a3c5e', '#F0B323', '#2f5d8a', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316'];

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading: eventLoading } = useEvent(id);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('registrations').select('*, booths(label, number)').eq('event_id', id),
      supabase.from('booths').select('*').eq('event_id', id),
    ]).then(([r, b]) => {
      setRegs((r.data ?? []) as Registration[]);
      setBooths((b.data ?? []) as Booth[]);
      setLoading(false);
    });
  }, [id]);

  const active = regs.filter((r) => ['pending', 'confirmed'].includes(r.status));
  const checkedIn = regs.filter((r) => r.checked_in_at).length;

  const daily = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of regs) {
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const days = [...byDay.keys()].sort();
    let running = 0;
    return days.map((d) => {
      running += byDay.get(d) ?? 0;
      return { day: format(parseISO(d), 'd MMM'), daily: byDay.get(d) ?? 0, total: running };
    });
  }, [regs]);

  const boothStats = useMemo(() => {
    const sellable = booths.filter((b) => ['available', 'reserved', 'booked'].includes(b.status));
    const byStatus = new Map<string, number>();
    for (const b of booths) byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
    const statusData = [...byStatus.entries()].map(([status, value]) => ({
      name: boothStatusMeta[status as keyof typeof boothStatusMeta]?.label ?? status,
      value,
      color: boothStatusMeta[status as keyof typeof boothStatusMeta]?.color ?? '#94a3b8',
    }));

    const byGroup = new Map<string, { total: number; booked: number }>();
    for (const b of sellable) {
      const g = b.group_name || 'Ungrouped';
      const cur = byGroup.get(g) ?? { total: 0, booked: 0 };
      cur.total += 1;
      if (b.status === 'booked') cur.booked += 1;
      byGroup.set(g, cur);
    }
    const groupData = [...byGroup.entries()]
      .map(([name, v]) => ({ name, booked: v.booked, available: v.total - v.booked }))
      .sort((a, b) => b.booked - a.booked);

    return {
      sellable: sellable.length,
      booked: sellable.filter((b) => b.status === 'booked').length,
      remaining: sellable.filter((b) => b.status === 'available').length,
      statusData,
      groupData,
    };
  }, [booths]);

  function exportReport() {
    if (!event) return;
    const rows = [
      ['HeadStart Events report', event.name],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Metric', 'Value'],
      ['Total registrations', String(regs.length)],
      ['Active (pending + confirmed)', String(active.length)],
      ['Waitlist', String(regs.filter((r) => r.status === 'waitlist').length)],
      ['Rejected / cancelled', String(regs.filter((r) => ['rejected', 'cancelled'].includes(r.status)).length)],
      ['Checked in', String(checkedIn)],
      ['Booths (sellable)', String(boothStats.sellable)],
      ['Booths booked', String(boothStats.booked)],
      ['Booths remaining', String(boothStats.remaining)],
      [],
      ['Registrations per day'],
      ['Day', 'Count', 'Running total'],
      ...daily.map((d) => [d.day, String(d.daily), String(d.total)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`${event.slug}-report.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
  }

  if (eventLoading || loading || !event) return <PageLoader label="Crunching the numbers" />;

  const occupancy = boothStats.sellable > 0 ? Math.round((boothStats.booked / boothStats.sellable) * 100) : 0;
  const capacityPct = event.max_registrations ? Math.round((active.length / event.max_registrations) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/admin/events/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-navy-800">Analytics</h1>
          <p className="text-sm text-slate-500">{event.name}</p>
        </div>
        <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportReport}>Export report</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard label="Registrations" value={regs.length} tone="navy" hint={capacityPct !== null ? `${capacityPct}% of capacity` : undefined} />
        <StatCard label="Active" value={active.length} tone="green" />
        <StatCard label="Waitlist" value={regs.filter((r) => r.status === 'waitlist').length} tone="gold" />
        <StatCard label="Booth occupancy" value={`${occupancy}%`} tone="navy" hint={`${boothStats.booked} of ${boothStats.sellable} booked`} />
        <StatCard label="Remaining booths" value={boothStats.remaining} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Registration trend">
          {daily.length === 0 ? (
            <EmptyState title="No registrations yet" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <ChartLegend />
                  <Line type="monotone" dataKey="daily" name="Per day" stroke="#F0B323" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="total" name="Running total" stroke="#1a3c5e" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Booth status breakdown">
          {booths.length === 0 ? (
            <EmptyState title="No floor plan booths" hint="Draw booths in the Floor Plan tab to see occupancy here." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={boothStats.statusData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}>
                    {boothStats.statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <ChartLegend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Most popular booth areas" className="lg:col-span-2">
          {boothStats.groupData.length === 0 ? (
            <EmptyState title="No booth groups" hint="Give booths a group name (e.g. Food Court) in the floor plan designer." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={boothStats.groupData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <ChartLegend />
                  <Bar dataKey="booked" name="Booked" stackId="a" fill="#1a3c5e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="available" name="Available" stackId="a" fill="#F0B323" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
