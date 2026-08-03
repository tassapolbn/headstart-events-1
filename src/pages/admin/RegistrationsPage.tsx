import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Check, Clock3, Download, FileSpreadsheet, Mail, Printer, Search, Trash2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booth, Registration, RegistrationStatus } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatDateTime } from '@/lib/utils';
import { boothList, boothText } from '@/lib/regBooths';
import { isStoredFileRef } from '@/lib/storage';
import { useToast } from '@/context/ToastContext';
import { Badge, Button, Card, EmptyState, PageLoader } from '@/components/ui/basics';
import { Input, Select } from '@/components/ui/inputs';
import { ConfirmDialog, Modal } from '@/components/ui/overlays';
import { Switch } from '@/components/ui/inputs';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { RegistrationModal } from '@/components/registrations/RegistrationModal';
import { exportCsv, exportXlsx } from '@/components/registrations/exporters';

const statusBadge: Record<RegistrationStatus, 'blue' | 'green' | 'amber' | 'red' | 'gray'> = {
  pending: 'blue', confirmed: 'green', waitlist: 'amber', rejected: 'red', cancelled: 'gray',
};
const filterTabs: Array<'all' | RegistrationStatus> = ['all', 'pending', 'confirmed', 'waitlist', 'rejected', 'cancelled'];

export default function RegistrationsPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading: eventLoading } = useEvent(id);
  const appSettings = useAppSettings();
  const { toast } = useToast();

  const [regs, setRegs] = useState<Registration[]>([]);
  const [allBooths, setAllBooths] = useState<Booth[]>([]);
  const [boothFilter, setBoothFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof filterTabs)[number]>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'name' | 'booth'>('newest');
  const [openReg, setOpenReg] = useState<Registration | null>(null);
  const [deleteReg, setDeleteReg] = useState<Registration | null>(null);

  // Print options
  const [printOpen, setPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'labels' | 'list'>('labels');
  const [printCols, setPrintCols] = useState<Set<string>>(new Set(['name', 'booth']));
  const [signatureBox, setSignatureBox] = useState(false);

  function togglePrintCol(key: string) {
    setPrintCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function startPrint() {
    setPrintOpen(false);
    window.setTimeout(() => window.print(), 150);
  }

  function printValue(r: Registration, key: string): string {
    switch (key) {
      case 'name': return r.name ?? '';
      case 'reference': return r.reference;
      case 'email': return r.email ?? '';
      case 'phone': return r.phone ?? '';
      case 'booth': return boothText(r);
      case 'status': return r.status;
      case 'created': return formatDateTime(r.created_at);
      default: {
        const v = r.data?.[key];
        if (v === null || v === undefined) return '';
        if (Array.isArray(v)) return v.join(', ');
        if (isStoredFileRef(v)) return v.name;
        if (typeof v === 'object') {
          return Object.entries(v as Record<string, unknown>)
            .filter(([, n]) => typeof n === 'number' && (n as number) > 0)
            .map(([k, n]) => `${k} x${n}`).join(', ');
        }
        return String(v);
      }
    }
  }

  async function load() {
    if (!id) return;
    const [r, b] = await Promise.all([
      supabase.from('registrations').select('*, booths!registrations_booth_id_fkey(label, number), registration_booths(booth_id, booths(label, number))').eq('event_id', id).order('created_at', { ascending: false }).limit(2000),
      supabase.from('booths').select('*').eq('event_id', id).order('number'),
    ]);
    if (r.error) toast(`Could not load registrations: ${r.error.message}`, 'error');
    setRegs((r.data ?? []) as Registration[]);
    setAllBooths((b.data ?? []) as Booth[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [id]);

  const booths = useMemo(() => allBooths.filter((b) => b.status === 'available'), [allBooths]);

  /** Booths that appear in the filter: those actually held by a registration. */
  const boothOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of regs) {
      for (const b of boothList(r)) {
        const key = (b.number || b.label).trim();
        if (key) seen.set(key, `${b.label} ${b.number}`.trim());
      }
    }
    return [...seen.keys()].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [regs]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: regs.length };
    for (const s of filterTabs.slice(1)) c[s] = regs.filter((r) => r.status === s).length;
    return c;
  }, [regs]);

  const visible = useMemo(() => {
    let list = filter === 'all' ? regs : regs.filter((r) => r.status === filter);

    if (boothFilter === '__none__') {
      list = list.filter((r) => boothList(r).length === 0);
    } else if (boothFilter !== 'all') {
      list = list.filter((r) => boothList(r).some((b) => (b.number || b.label).trim() === boothFilter));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.name, r.email, r.phone, r.reference, boothText(r)]
          .some((v) => v && String(v).toLowerCase().includes(q))
      );
    }
    if (sort === 'newest') list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sort === 'oldest') list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (sort === 'name') list = [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    if (sort === 'booth') {
      const key = (r: Registration) => {
        const first = boothList(r)[0];
        if (!first) return Number.POSITIVE_INFINITY;
        const n = Number(first.number);
        return Number.isNaN(n) ? Number.POSITIVE_INFINITY - 1 : n;
      };
      list = [...list].sort((a, b) => key(a) - key(b) || boothText(a).localeCompare(boothText(b)));
    }
    return list;
  }, [regs, filter, search, sort, boothFilter]);

  async function setStatus(reg: Registration, status: RegistrationStatus) {
    // Rejecting or cancelling releases all held booths automatically (database trigger).
    const { error } = await supabase.from('registrations').update({ status }).eq('id', reg.id);
    if (error) toast(error.message, 'error');
    else {
      toast(`Registration ${status === 'confirmed' ? 'approved' : `moved to ${status}`}.`);
      void load();
    }
  }

  async function handleDelete() {
    if (!deleteReg) return;
    // Held booths are released automatically by a database trigger.
    const { error } = await supabase.from('registrations').delete().eq('id', deleteReg.id);
    if (error) toast(error.message, 'error');
    else {
      toast('Registration deleted.');
      void load();
    }
  }

  function resendEmail(reg: Registration) {
    if (!appSettings?.webhook_url) {
      toast('Set the email relay URL in Settings first.', 'error');
      return;
    }
    void fetch(appSettings.webhook_url, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ reference: reg.reference, resend: true }),
    }).catch(() => undefined);
    toast(`Confirmation email requested for ${reg.reference}.`);
  }

  if (eventLoading || loading || !event) return <PageLoader label="Loading registrations" />;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to={`/admin/events/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-navy-800">Registrations</h1>
          <p className="text-sm text-slate-500">{event.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv(event, visible)}>CSV</Button>
          <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => exportXlsx(event, visible)}>Excel</Button>
          <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => setPrintOpen(true)}>Print</Button>
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1">
          {filterTabs.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${filter === f ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {f} ({counts[f] ?? 0})
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, booth" className="pl-9" aria-label="Search registrations" />
        </div>
        <Select
          value={boothFilter}
          onChange={(e) => setBoothFilter(e.target.value)}
          className="w-44"
          aria-label="Filter by booth number"
        >
          <option value="all">All booths</option>
          <option value="__none__">No booth assigned</option>
          {boothOptions.map((b) => <option key={b} value={b}>Booth {b}</option>)}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-36" aria-label="Sort registrations">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">By name</option>
          <option value="booth">By booth number</option>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No registrations match"
          hint={boothFilter !== 'all' ? 'No one has taken that booth yet. Try "All booths".' : 'Try a different filter or search term.'}
        />
      ) : (
        <Card padded={false} className="print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Booth</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Submitted</th>
                  <th className="no-print px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5">
                      <button onClick={() => setOpenReg(r)} className="font-mono text-xs font-semibold text-navy-700 hover:underline">
                        {r.reference}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">{r.name ?? '-'}</td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-500">{r.email ?? '-'}</td>
                    <td className="px-4 py-2.5">{boothText(r) || '-'}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={statusBadge[r.status]} className="capitalize">{r.status}</Badge>
                      {r.checked_in_at && <Badge color="navy" className="ml-1">In</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                    <td className="no-print px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {r.status !== 'confirmed' && (
                          <button title="Approve" aria-label={`Approve ${r.reference}`} onClick={() => void setStatus(r, 'confirmed')} className="rounded p-1.5 text-emerald-500 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
                        )}
                        {r.status !== 'waitlist' && (
                          <button title="Move to waitlist" aria-label={`Waitlist ${r.reference}`} onClick={() => void setStatus(r, 'waitlist')} className="rounded p-1.5 text-amber-500 hover:bg-amber-50"><Clock3 className="h-4 w-4" /></button>
                        )}
                        {r.status !== 'rejected' && (
                          <button title="Reject" aria-label={`Reject ${r.reference}`} onClick={() => void setStatus(r, 'rejected')} className="rounded p-1.5 text-red-400 hover:bg-red-50"><X className="h-4 w-4" /></button>
                        )}
                        <button title="Resend confirmation email" aria-label={`Resend email for ${r.reference}`} onClick={() => resendEmail(r)} className="rounded p-1.5 text-navy-500 hover:bg-navy-50"><Mail className="h-4 w-4" /></button>
                        <button title="Delete" aria-label={`Delete ${r.reference}`} onClick={() => setDeleteReg(r)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {openReg && (
        <RegistrationModal
          event={event}
          registration={openReg}
          availableBooths={booths}
          onClose={() => setOpenReg(null)}
          onSaved={() => void load()}
        />
      )}

      {/* Print options */}
      <Modal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="Print registrations"
        footer={
          <>
            <Button variant="outline" onClick={() => setPrintOpen(false)}>Cancel</Button>
            <Button icon={<Printer className="h-4 w-4" />} onClick={startPrint}>Print {visible.length} item{visible.length === 1 ? '' : 's'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPrintMode('labels')}
              className={`rounded-xl border p-3 text-left text-sm transition ${printMode === 'labels' ? 'border-navy-500 ring-2 ring-navy-100' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className="block font-semibold text-navy-800">Name cards</span>
              <span className="text-xs text-slate-500">Big vendor name and booth number, 8 per page, to attach at each booth.</span>
            </button>
            <button
              onClick={() => setPrintMode('list')}
              className={`rounded-xl border p-3 text-left text-sm transition ${printMode === 'list' ? 'border-navy-500 ring-2 ring-navy-100' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className="block font-semibold text-navy-800">Detail list</span>
              <span className="text-xs text-slate-500">A table with only the columns you tick, for the front desk.</span>
            </button>
          </div>

          {printMode === 'list' && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Columns to include</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ['name', 'Name'], ['reference', 'Reference'], ['booth', 'Booth'],
                  ['email', 'Email'], ['phone', 'Phone'], ['status', 'Status'], ['created', 'Submitted'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => togglePrintCol(key)}
                    aria-pressed={printCols.has(key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${printCols.has(key) ? 'border-navy-600 bg-navy-700 text-white' : 'border-slate-300 text-slate-500 hover:border-navy-300'}`}
                  >
                    {label}
                  </button>
                ))}
                {event.form_schema.filter((f) => !isContentField(f)).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => togglePrintCol(f.id)}
                    aria-pressed={printCols.has(f.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${printCols.has(f.id) ? 'border-navy-600 bg-navy-700 text-white' : 'border-slate-300 text-slate-500 hover:border-navy-300'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <Switch
                checked={signatureBox}
                onChange={setSignatureBox}
                label="Add a signature box column"
                description="An empty box on each row for the vendor to sign when registering at the front desk."
              />
            </>
          )}
          <p className="text-xs text-slate-500">Prints the {visible.length} registrations currently shown (respects your search and filter).</p>
        </div>
      </Modal>

      {/* Print output */}
      <div className="hidden print:block">
        {printMode === 'labels' ? (
          <div className="grid grid-cols-2 gap-4">
            {visible.map((r) => (
              <div key={r.id} className="flex h-56 flex-col items-center justify-center rounded-xl border-4 border-[#1a3c5e] p-4 text-center" style={{ breakInside: 'avoid' }}>
                <p className="text-3xl font-extrabold leading-tight text-[#1a3c5e]">{r.name ?? 'Unnamed'}</p>
                {boothText(r) && (
                  <p className="mt-3 rounded-full bg-[#F0B323] px-5 py-1.5 text-xl font-bold text-[#1a3c5e]">Booth {boothText(r)}</p>
                )}
                <p className="mt-3 font-mono text-xs text-slate-400">{r.reference}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-bold">{event.name}: registrations</h1>
            <p className="mb-4 text-sm">Printed {new Date().toLocaleString()} - {visible.length} item(s)</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-400 px-2 py-1.5 text-left">#</th>
                  {[...printCols].map((key) => {
                    const builtIn: Record<string, string> = { name: 'Name', reference: 'Reference', booth: 'Booth', email: 'Email', phone: 'Phone', status: 'Status', created: 'Submitted' };
                    const label = builtIn[key] ?? event.form_schema.find((f) => f.id === key)?.label ?? key;
                    return <th key={key} className="border border-slate-400 px-2 py-1.5 text-left">{label}</th>;
                  })}
                  {signatureBox && <th className="border border-slate-400 px-2 py-1.5 text-left" style={{ width: '160px' }}>Signature</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r, i) => (
                  <tr key={r.id}>
                    <td className="border border-slate-400 px-2 py-1.5">{i + 1}</td>
                    {[...printCols].map((key) => (
                      <td key={key} className="border border-slate-400 px-2 py-1.5 text-xs">{printValue(r, key)}</td>
                    ))}
                    {signatureBox && <td className="h-14 border border-slate-400 px-2 py-1.5" />}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteReg}
        onClose={() => setDeleteReg(null)}
        onConfirm={() => void handleDelete()}
        title="Delete registration?"
        message={`Registration ${deleteReg?.reference} will be permanently removed and its booth released.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
