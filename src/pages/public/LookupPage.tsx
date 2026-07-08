import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, Search, TicketCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/utils';
import { friendlyError } from '@/lib/errors';
import { Button } from '@/components/ui/basics';
import { Input } from '@/components/ui/inputs';

interface LookupResult {
  reference: string;
  name: string | null;
  status: string;
  checked_in_at: string | null;
  event: { name: string; event_date: string | null; start_time: string | null; end_time: string | null; location: string };
  booth: { label: string; number: string } | null;
  booths: Array<{ label: string; number: string }> | null;
}

export default function LookupPage() {
  const [params] = useSearchParams();
  const [ref, setRef] = useState(params.get('ref') ?? '');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const { data, error: err } = await supabase.rpc('get_registration_by_reference', { p_reference: value.trim() });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setResult(data as unknown as LookupResult);
  }

  useEffect(() => {
    const initial = params.get('ref');
    if (initial) void lookup(initial);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void lookup(ref);
  }

  return (
    <main className="min-h-screen bg-slate-100 py-12">
      <div className="mx-auto max-w-md px-4">
        <div className="text-center">
          <TicketCheck className="mx-auto h-10 w-10 text-navy-700" />
          <h1 className="mt-2 font-display text-2xl font-bold text-navy-800">Find my registration</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the reference from your confirmation email, e.g. HS-4F7A2C.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 flex gap-2">
          <Input
            value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())}
            placeholder="HS-XXXXXX" className="font-mono uppercase" aria-label="Registration reference"
          />
          <Button type="submit" loading={busy} icon={<Search className="h-4 w-4" />}>Search</Button>
        </form>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="mt-6 rounded-2xl bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-mono text-lg font-bold text-navy-800">{result.reference}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${result.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : result.status === 'waitlist' ? 'bg-amber-100 text-amber-700' : result.status === 'pending' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                {result.status}
              </span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Name</dt><dd className="font-medium text-slate-800">{result.name ?? '-'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Event</dt><dd className="font-medium text-slate-800">{result.event.name}</dd></div>
              {result.event.event_date && <div className="flex justify-between gap-4"><dt className="text-slate-500">Date</dt><dd className="font-medium text-slate-800">{formatDate(result.event.event_date, 'EEE d MMM yyyy')} {formatTimeRange(result.event.start_time, result.event.end_time)}</dd></div>}
              {result.event.location && <div className="flex justify-between gap-4"><dt className="text-slate-500">Location</dt><dd className="font-medium text-slate-800">{result.event.location}</dd></div>}
              {result.booths && result.booths.length > 0 && <div className="flex justify-between gap-4"><dt className="text-slate-500">Booth{result.booths.length > 1 ? 's' : ''}</dt><dd className="font-semibold text-slate-800">{result.booths.map((b) => `${b.label} ${b.number}`.trim()).join(' + ')}</dd></div>}
              {result.checked_in_at && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
                  <BadgeCheck className="h-4 w-4" /> Checked in {formatDateTime(result.checked_in_at)}
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}
