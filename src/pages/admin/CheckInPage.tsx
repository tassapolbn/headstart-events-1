import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ArrowLeft, BadgeCheck, Camera, CameraOff, Download, Printer, Search, TicketCheck, TicketX, Undo2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Registration } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { formatDateTime, download, cn } from '@/lib/utils';
import { boothText } from '@/lib/regBooths';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, Card, EmptyState, PageLoader, StatCard } from '@/components/ui/basics';
import { Input } from '@/components/ui/inputs';

const SCANNER_ID = 'qr-scanner-region';

interface TicketResult {
  reference: string;
  name: string | null;
  status: string;
  already_checked_in: boolean;
  checked_in_at: string | null;
  data: Record<string, unknown>;
  booths: Array<{ label: string; number: string }> | null;
}

export default function CheckInPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading: eventLoading } = useEvent(id);
  const { toast } = useToast();
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [ticket, setTicket] = useState<TicketResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScan = useRef<{ ref: string; at: number }>({ ref: '', at: 0 });

  async function load() {
    if (!id) return;
    const { data } = await supabase
      .from('registrations')
      .select('*, booths(label, number), registration_booths(booth_id, booths(label, number))')
      .eq('event_id', id)
      .in('status', ['confirmed', 'pending'])
      .order('name');
    setRegs((data ?? []) as Registration[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [id]);

  useEffect(() => () => {
    if (scannerRef.current?.isScanning) void scannerRef.current.stop().catch(() => undefined);
  }, []);

  const checkedIn = regs.filter((r) => r.checked_in_at);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return regs;
    return regs.filter((r) =>
      [r.name, r.email, r.reference, boothText(r)]
        .some((v) => v && String(v).toLowerCase().includes(q))
    );
  }, [regs, search]);

  /** Arrived after the event start time? */
  function isLate(r: Registration): boolean {
    if (!r.checked_in_at || !event?.event_date || !event.start_time) return false;
    return new Date(r.checked_in_at).getTime() > new Date(`${event.event_date}T${event.start_time}:00`).getTime();
  }

  /** Menu quantity answers, rendered as ticket lines. */
  function menuLines(data: Record<string, unknown>): Array<{ label: string; lines: string[] }> {
    if (!event) return [];
    return event.form_schema
      .filter((f) => f.type === 'menu_quantity')
      .map((f) => {
        const v = data?.[f.id];
        if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
        const lines = Object.entries(v as Record<string, number>)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${k} x ${n}`);
        return lines.length > 0 ? { label: f.label, lines } : null;
      })
      .filter((x): x is { label: string; lines: string[] } => !!x);
  }

  async function checkIn(reference: string) {
    const { data, error } = await supabase.rpc('checkin_by_reference', { p_reference: reference });
    if (error) {
      toast(error.message.includes('NOT_FOUND') ? `No registration found for ${reference}.` : error.message, 'error');
      return;
    }
    const t = data as unknown as TicketResult;
    setTicket(t);
    if (!t.already_checked_in) toast(`${reference} checked in.`);
    void load();
  }

  async function undoCheckIn(reg: Registration) {
    const { error } = await supabase.from('registrations').update({ checked_in_at: null }).eq('id', reg.id);
    if (error) toast(error.message, 'error');
    else void load();
  }

  async function toggleScanner() {
    if (scanning) {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop().catch(() => undefined);
      setScanning(false);
      return;
    }
    setScanning(true);
    window.setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          (text) => {
            const match = text.match(/HS-[A-Z0-9]{6}/i)?.[0]?.toUpperCase()
              ?? new URLSearchParams(text.split('?')[1] ?? '').get('ref')?.toUpperCase()
              ?? text.trim().toUpperCase();
            const now = Date.now();
            if (match && (match !== lastScan.current.ref || now - lastScan.current.at > 4000)) {
              lastScan.current = { ref: match, at: now };
              void checkIn(match);
            }
          },
          () => undefined
        );
      } catch {
        toast('Could not start the camera. You can still search and check in manually.', 'error');
        setScanning(false);
      }
    }, 60);
  }

  function exportAttendance() {
    const rows = [
      ['Reference', 'Name', 'Email', 'Booth', 'Status', 'Checked in at', 'Late'],
      ...regs.map((r) => [
        r.reference, r.name ?? '', r.email ?? '', boothText(r),
        r.checked_in_at ? 'Present' : 'Not arrived',
        r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : '',
        isLate(r) ? 'Late' : '',
      ]),
    ];
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`${event?.slug ?? 'event'}-attendance.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
  }

  if (eventLoading || loading || !event) return <PageLoader label="Loading check in" />;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to={`/admin/events/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-navy-800">Event check in</h1>
          <p className="text-sm text-slate-500">{event.name}</p>
        </div>
        <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print check sheet</Button>
        <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportAttendance}>Export</Button>
      </div>

      <div className="no-print grid grid-cols-3 gap-3">
        <StatCard label="Expected" value={regs.length} tone="navy" />
        <StatCard label="Checked in" value={checkedIn.length} tone="green" />
        <StatCard label="Not arrived" value={regs.length - checkedIn.length} tone="slate" />
      </div>

      {/* Ticket scan result */}
      {ticket && (
        <div
          role="alert"
          className={cn(
            'no-print flex flex-wrap items-start gap-4 rounded-2xl border-2 p-4',
            ticket.already_checked_in ? 'border-red-400 bg-red-50' : 'border-emerald-400 bg-emerald-50'
          )}
        >
          {ticket.already_checked_in
            ? <TicketX className="h-10 w-10 shrink-0 text-red-500" />
            : <TicketCheck className="h-10 w-10 shrink-0 text-emerald-500" />}
          <div className="min-w-0 flex-1">
            <p className={cn('font-display text-lg font-bold', ticket.already_checked_in ? 'text-red-700' : 'text-emerald-700')}>
              {ticket.already_checked_in
                ? `Ticket already used ${ticket.checked_in_at ? `at ${formatDateTime(ticket.checked_in_at)}` : ''}`
                : 'Valid ticket, checked in'}
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{ticket.name ?? 'Unnamed'}</span>
              <span className="ml-2 font-mono text-xs text-slate-500">{ticket.reference}</span>
              {ticket.booths && ticket.booths.length > 0 && (
                <span className="ml-2 text-slate-500">Booth {ticket.booths.map((b) => b.number || b.label).join(', ')}</span>
              )}
            </p>
            {menuLines(ticket.data).map((m) => (
              <div key={m.label} className="mt-1.5 rounded-lg bg-white/70 px-3 py-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{m.label}</span>
                <ul className="mt-0.5 space-y-0.5">
                  {m.lines.map((l) => <li key={l} className="font-medium text-slate-800">{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <button aria-label="Dismiss scan result" onClick={() => setTicket(null)} className="rounded p-1 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="no-print grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card title="Scan ticket QR (optional)">
          <div className="space-y-3">
            <Button
              className="w-full"
              variant={scanning ? 'danger' : 'outline'}
              icon={scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              onClick={() => void toggleScanner()}
            >
              {scanning ? 'Stop camera' : 'Start camera scanner'}
            </Button>
            <div id={SCANNER_ID} className={scanning ? 'overflow-hidden rounded-xl' : 'hidden'} aria-label="QR scanner viewport" />
            <p className="text-xs text-slate-500">
              Each QR works once, like a ticket. Scanning it a second time shows a red warning with the original check in time.
            </p>
          </div>
        </Card>

        <Card title={`Attendee checklist (${visible.length})`}>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, reference or booth" className="pl-9" aria-label="Search attendees" />
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No matching attendees" />
          ) : (
            <ul className="max-h-[52vh] divide-y divide-slate-100 overflow-y-auto">
              {visible.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {r.name ?? 'Unnamed'} <span className="font-mono text-xs text-slate-400">{r.reference}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {boothText(r) ? `Booth ${boothText(r)}` : r.email}
                      {r.checked_in_at && ` - in at ${formatDateTime(r.checked_in_at)}`}
                    </p>
                  </div>
                  {r.checked_in_at ? (
                    <div className="flex items-center gap-1.5">
                      {isLate(r) && <Badge color="amber">Late</Badge>}
                      <Badge color="green"><BadgeCheck className="h-3.5 w-3.5" /> Present</Badge>
                      <button title="Undo check in" aria-label={`Undo check in for ${r.reference}`} onClick={() => void undoCheckIn(r)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
                        <Undo2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => void checkIn(r.reference)}>Check in</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Printable sign up / check sheet */}
      <div className="hidden print:block">
        <h1 className="mb-1 text-xl font-bold">{event.name}: sign up sheet</h1>
        <p className="mb-4 text-sm">Date: {event.event_date ?? ''} {event.start_time ?? ''} - Printed {new Date().toLocaleString()}</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-400 px-2 py-1.5 text-left">#</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Name</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Reference</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Booth / Menu</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Arrived</th>
              <th className="border border-slate-400 px-2 py-1.5 text-left">Time / Note</th>
            </tr>
          </thead>
          <tbody>
            {regs.map((r, i) => (
              <tr key={r.id}>
                <td className="border border-slate-400 px-2 py-1.5">{i + 1}</td>
                <td className="border border-slate-400 px-2 py-1.5">{r.name ?? ''}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono text-xs">{r.reference}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-xs">
                  {boothText(r)}
                  {menuLines(r.data).map((m) => m.lines.join(', ')).filter(Boolean).join(' | ')}
                </td>
                <td className="border border-slate-400 px-2 py-1.5 text-center">{r.checked_in_at ? 'YES' : '☐'}</td>
                <td className="border border-slate-400 px-2 py-1.5 text-xs">{r.checked_in_at ? formatDateTime(r.checked_in_at) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
