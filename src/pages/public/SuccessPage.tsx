import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDays, CalendarPlus, Check, Clock, MapPin, Printer, Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { EventRecord } from '@/lib/types';
import { normalizeEvent } from '@/hooks/useEvent';
import { themeStyle } from '@/lib/theme';
import { download, formatDate, formatTimeRange } from '@/lib/utils';
import { buildIcs } from '@/lib/ics';
import { PageLoader } from '@/components/ui/basics';
import { richToHtml } from '@/components/ui/RichTextArea';

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
  const location = useLocation();
  const menu = ((location.state as { menu?: Array<{ label: string; lines: string[] }> } | null)?.menu) ?? [];
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
  const showQr = event?.settings.showQrOnSuccess ?? true;
  const boothsText = reg?.booths && reg.booths.length > 0
    ? reg.booths.map((b) => `${b.label} ${b.number}`.trim()).join(' + ')
    : null;

  function addToCalendar() {
    if (!event) return;
    const ics = buildIcs(event, reference);
    if (ics) download(`${event.slug}.ics`, ics, 'text/calendar');
  }

  const infoItems = [
    reg?.event.event_date && { icon: CalendarDays, label: 'Date', value: formatDate(reg.event.event_date, 'EEEE d MMMM yyyy') },
    formatTimeRange(reg?.event.start_time ?? null, reg?.event.end_time ?? null) && { icon: Clock, label: 'Time', value: formatTimeRange(reg?.event.start_time ?? null, reg?.event.end_time ?? null) },
    reg?.event.location && { icon: MapPin, label: 'Location', value: reg.event.location },
    boothsText && { icon: Store, label: reg!.booths!.length > 1 ? 'Your booths' : 'Your booth', value: boothsText },
  ].filter(Boolean) as Array<{ icon: typeof CalendarDays; label: string; value: string }>;

  return (
    <main className="event-theme event-theme-page min-h-screen py-10 sm:py-14" style={themeStyle(event?.theme)}>
      <div className="mx-auto max-w-xl px-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="text-center"
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }}
            className="inline-flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
            style={{ background: waitlisted || pending ? '#f59e0b' : '#22c55e' }}
          >
            <Check className="h-11 w-11 text-white" strokeWidth={3} />
          </motion.span>
          <h1 className="mt-5 text-3xl font-extrabold sm:text-4xl" style={{ color: 'var(--ev-title)' }}>
            {waitlisted ? 'You are on the waitlist' : pending ? 'Registration received' : 'Registration confirmed!'}
          </h1>
          <p className="mt-1.5 text-sm opacity-70">{reg?.event.name ?? event?.name}</p>
        </motion.div>

        {/* Thank you message */}
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="ev-card ev-accent-top mt-7 p-6 text-center sm:p-8"
        >
          <div
            className="ev-rich mx-auto max-w-md text-[15px] leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: richToHtml(
                waitlisted
                  ? 'The event is currently full. We will contact you as soon as a place becomes available.'
                  : pending
                    ? 'Your registration is awaiting approval. You will receive an email once it has been reviewed.'
                    : event?.settings.confirmationMessage || 'Thank you for registering. We look forward to seeing you at the event.'
              ),
            }}
          />

          {/* Event info */}
          {infoItems.length > 0 && (
            <dl className="mt-6 grid gap-2.5 text-left sm:grid-cols-2">
              {infoItems.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 rounded-xl bg-slate-50/80 px-4 py-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--ev-primary)' }} />
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide opacity-50">{label}</dt>
                    <dd className="text-sm font-semibold">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          {/* Menu selection (food ticket) */}
          {menu.length > 0 && (
            <div className="mt-4 rounded-xl bg-slate-50/80 px-4 py-3 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-50">Your selection</p>
              {menu.map((m) => (
                <div key={m.label} className="mt-1">
                  <ul className="space-y-0.5 text-sm font-semibold">
                    {m.lines.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Ticket */}
        <motion.div
          initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="ev-card mt-5 overflow-hidden print-page"
        >
          <div className="px-6 pt-5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-50">Your reference</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.15em]" style={{ color: 'var(--ev-primary)' }}>
              {reference}
            </p>
          </div>
          <div className="relative my-4 flex items-center" aria-hidden="true">
            <span className="absolute -left-3 h-6 w-6 rounded-full" style={{ background: 'var(--ev-bg)' }} />
            <span className="mx-6 h-px flex-1 border-t-2 border-dashed border-slate-200" />
            <span className="absolute -right-3 h-6 w-6 rounded-full" style={{ background: 'var(--ev-bg)' }} />
          </div>
          <div className="px-6 pb-6 text-center">
            {showQr ? (
              <>
                <div className="inline-block rounded-2xl border border-slate-200 bg-white p-3">
                  <QRCodeSVG value={lookupUrl} size={150} level="M" aria-label={`QR code for registration ${reference}`} />
                </div>
                <p className="mt-2 text-xs opacity-60">Show this QR code to staff at the event. It can only be used once.</p>
              </>
            ) : (
              <p className="text-sm opacity-70">Please keep this reference. You can look up your registration any time.</p>
            )}
            {event?.email_template.enabled && <p className="mt-2 text-xs opacity-60">A confirmation email is on its way to your inbox.</p>}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="no-print mt-6 flex flex-wrap justify-center gap-2"
        >
          {event?.event_date && (
            <button onClick={addToCalendar} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold hover:bg-white">
              <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
            </button>
          )}
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold hover:bg-white">
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold hover:bg-white">
            All events
          </Link>
        </motion.div>
      </div>
    </main>
  );
}
