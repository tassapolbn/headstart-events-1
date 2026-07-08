import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, BadgeCheck, Camera, CameraOff, Download, Search, Undo2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Registration } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { formatDateTime, download } from '@/lib/utils';
import { boothText } from '@/lib/regBooths';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, Card, EmptyState, PageLoader, StatCard } from '@/components/ui/basics';
import { Input } from '@/components/ui/inputs';

const SCANNER_ID = 'qr-scanner-region';

export default function CheckInPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading: eventLoading } = useEvent(id);
  const { toast } = useToast();
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
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
    // Stop the camera when leaving the page.
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

  async function checkIn(reference: string) {
    const { error } = await supabase.rpc('checkin_by_reference', { p_reference: reference });
    if (error) {
      toast(error.message.includes('NOT_FOUND') ? `No registration found for ${reference}.` : error.message, 'error');
    } else {
      toast(`${reference} checked in.`);
      void load();
    }
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
    // Give React a moment to render the scanner region.
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
      ['Reference', 'Name', 'Email', 'Booth', 'Status', 'Checked in at'],
      ...regs.map((r) => [
        r.reference, r.name ?? '', r.email ?? '',
        boothText(r),
        r.checked_in_at ? 'Present' : 'Not arrived',
        r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : '',
      ]),
    ];
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download(`${event?.slug ?? 'event'}-attendance.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
  }

  if (eventLoading || loading || !event) return <PageLoader label="Loading check in" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/admin/events/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-navy-800">Event check in</h1>
          <p className="text-sm text-slate-500">{event.name}</p>
        </div>
        <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportAttendance}>Export attendance</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Expected" value={regs.length} tone="navy" />
        <StatCard label="Checked in" value={checkedIn.length} tone="green" />
        <StatCard label="Not arrived" value={regs.length - checkedIn.length} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card title="Scan QR code">
          <div className="space-y-3">
            <Button
              className="w-full"
              variant={scanning ? 'danger' : 'primary'}
              icon={scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              onClick={() => void toggleScanner()}
            >
              {scanning ? 'Stop camera' : 'Start camera scanner'}
            </Button>
            <div id={SCANNER_ID} className={scanning ? 'overflow-hidden rounded-xl' : 'hidden'} aria-label="QR scanner viewport" />
            <p className="text-xs text-slate-500">
              Point the camera at the QR code on the visitor's confirmation email or printed slip.
            </p>
          </div>
        </Card>

        <Card title={`Attendee list (${visible.length})`}>
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
    </div>
  );
}
