import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarPlus, CheckCircle2, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventRecord } from '@/lib/types';
import { normalizeEvent } from '@/hooks/useEvent';
import { themeStyle } from '@/lib/theme';
import { download, formatDate, formatTimeRange } from '@/lib/utils';
import { buildIcs } from '@/lib/ics';
import { PageLoader } from '@/components/ui/basics';

interface LookupResult {
  reference: string;
  name: string | null;
  status: string;
  event: { name: string; event_date: string | null; start_time: string | null; end_time: string | null; location: string; slug: string };
  booth: { label: string; number: string } | null;
  booths: Array<{ label: string; number: string }> | null;
}

export default function SuccessPage() {
  const { slug, reference } = useParams<{ slug: string; reference: string }>();
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [reg, setReg] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [ev, lookup] = await Promise.all([
        supabase.from('events').select('*').eq('slug', slug).maybeSingle(),
        supabase.rpc('get_registration_by_reference', { p_reference: reference }),
      ]);
      if (ev.data) setEvent(normalizeEvent(ev.data));
      if (lookup.data) setReg(lookup.data as unknown as LookupResult);
      setLoading(false);
    }
    void load();
  }, [slug, reference]);

  if (loading) return <PageLoader label="Confirming your registration" />;

  const lookupUrl = `${window.location.origin}/lookup?ref=${reference}`;
  const waitlisted = reg?.status === 'waitlist';
  const pending = reg?.status === 'pending';

  function addToCalendar() {
    if (!event) return;
    const ics = buildIcs(event, reference);
    if (ics) download(`${event.slug}.ics`, ics, 'text/calendar');
  }

  return (
    <main className="event-theme min-h-screen py-10" style={themeStyle(event?.theme)}>
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-lg px-4"
      >
        <div className="ev-card overflow-hidden text-center shadow-card print-page">
          <div className="px-6 pb-2 pt-8">
            <CheckCircle2 className="mx-auto h-14 w-14" style={{ color: waitlisted || pending ? '#f59e0b' : '#22c55e' }} />
            <h1 className="mt-3 text-2xl font-bold" style={{ color: 'var(--ev-primary)' }}>
              {waitlisted ? 'You are on the waitlist' : pending ? 'Registration received' : 'Registration confirmed'}
            </h1>
            <p className="mt-2 text-sm opacity-80">
              {waitlisted
                ? 'The event is currently full. We will contact you if a place becomes available.'
                : pending
                  ? 'Your registration is awaiting approval. You will receive an email once it is reviewed.'
                  : event?.settings.confirmationMessage || 'Thank you for registering. We look forward to seeing you.'}
            </p>
          </div>

          <div className="mx-6 my-5 rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-xs uppercase tracking-wide opacity-60">Your reference</p>
            <p className="font-mono text-2xl font-bold tracking-wider" style={{ color: 'var(--ev-primary)' }}>{reference}</p>
            <div className="mt-4 flex justify-center">
              <QRCodeSVG value={lookupUrl} size={148} level="M" includeMargin aria-label={`QR code for registration ${reference}`} />
            </div>
            <p className="mt-2 text-xs opacity-60">Show this QR code at the event for check in.</p>
          </div>

          <dl className="space-y-1.5 px-6 pb-4 text-sm">
            {reg?.event && (
              <>
                <div className="flex justify-between gap-4"><dt className="opacity-60">Event</dt><dd className="font-medium">{reg.event.name}</dd></div>
                {reg.event.event_date && <div className="flex justify-between gap-4"><dt className="opacity-60">Date</dt><dd className="font-medium">{formatDate(reg.event.event_date, 'EEE d MMM yyyy')}</dd></div>}
                {formatTimeRange(reg.event.start_time, reg.event.end_time) && <div className="flex justify-between gap-4"><dt className="opacity-60">Time</dt><dd className="font-medium">{formatTimeRange(reg.event.start_time, reg.event.end_time)}</dd></div>}
                {reg.event.location && <div className="flex justify-between gap-4"><dt className="opacity-60">Location</dt><dd className="font-medium">{reg.event.location}</dd></div>}
              </>
            )}
            {reg?.booths && reg.booths.length > 0 && (
              <div className="flex justify-between gap-4"><dt className="opacity-60">Booth{reg.booths.length > 1 ? 's' : ''}</dt><dd className="font-semibold">{reg.booths.map((b) => `${b.label} ${b.number}`.trim()).join(' + ')}</dd></div>
            )}
          </dl>

          <p className="px-6 pb-2 text-xs opacity-60">A confirmation email is on its way to your inbox.</p>

          <div className="no-print flex flex-wrap justify-center gap-2 border-t border-slate-100 px-6 py-4">
            {event?.event_date && (
              <button onClick={addToCalendar} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50">
                <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
              </button>
            )}
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50">
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50">
              All events
            </Link>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
