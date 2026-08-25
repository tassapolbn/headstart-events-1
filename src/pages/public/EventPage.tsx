import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, ChevronDown, Clock, Info, MapPin, ShieldCheck } from 'lucide-react';
import type { FieldValues } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import type { Booth, EventRecord, SubmitResult } from '@/lib/types';
import { normalizeEvent } from '@/hooks/useEvent';
import { useAppSettings } from '@/hooks/useAppSettings';
import { fetchCampus } from '@/context/CampusContext';
import type { Campus } from '@/lib/types';
import { themeStyle } from '@/lib/theme';
import { formatDate, formatTimeRange } from '@/lib/utils';
import { friendlyError } from '@/lib/errors';
import { uploadVendorFile, dataUrlToBlob } from '@/lib/storage';
import { isContentField, isVisible } from '@/components/form-renderer/fieldZod';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { BoothPicker } from '@/components/floor-plan/BoothPicker';
import { useToast } from '@/context/ToastContext';
import { PageLoader } from '@/components/ui/basics';
import { richToHtml } from '@/components/ui/RichTextArea';

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const appSettings = useAppSettings();

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [campus, setCampus] = useState<Campus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [boothIds, setBoothIds] = useState<string[]>([]);
  const [boothInfos, setBoothInfos] = useState<Booth[]>([]);
  const [ack, setAck] = useState(false);
  const [liveValues, setLiveValues] = useState<Record<string, unknown>>({});
  const handleValuesChange = useCallback((v: Record<string, unknown>) => setLiveValues(v), []);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const hpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('events').select('*').eq('slug', slug).maybeSingle();
      if (!data) setNotFound(true);
      else {
        const ev = normalizeEvent(data);
        setEvent(ev);
        void fetchCampus(ev.campus_id).then(setCampus);
      }
      setLoading(false);
    }
    void load();
  }, [slug]);

  const windowState = useMemo(() => {
    if (!event) return 'open';
    const now = Date.now();
    if (event.status === 'closed') return 'closed';
    if (event.reg_opens_at && now < new Date(event.reg_opens_at).getTime()) return 'not_open';
    if (event.reg_closes_at && now > new Date(event.reg_closes_at).getTime()) return 'closed';
    return 'open';
  }, [event]);

  if (loading) return <PageLoader label="Loading event" />;
  if (notFound || !event) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="rounded-2xl bg-white p-10 text-center shadow-card">
          <p className="font-display text-lg font-semibold text-navy-800">Event not found</p>
          <p className="mt-1 text-sm text-slate-500">This registration link is not available. Please check the link you received.</p>
        </div>
      </main>
    );
  }

  const t = event.theme;
  const boothsEnabled = event.floor_plan.enabled && event.settings.boothSelection === 'single';
  const vendorTypeField = event.floor_plan.vendorTypeField ?? '';
  const vendorTypeValue = vendorTypeField ? String(liveValues[vendorTypeField] ?? '') : '';
  const activePolicies = event.policies.filter((p) => p.enabled && (p.title || p.content));
  const logo = event.branding.logo_url ?? campus?.logo_url ?? appSettings?.logo_url ?? '/logo.svg';
  const anim = t.animations
    ? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }
    : { initial: false as const, animate: undefined };

  // Sections lift into view as the visitor scrolls, with a springy settle.
  const reveal = t.animations
    ? {
        initial: { opacity: 0, y: 34 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.15 },
        transition: { type: 'spring' as const, stiffness: 120, damping: 18, mass: 0.7 },
      }
    : {};

  async function handleSubmit(values: FieldValues) {
    if (!event) return;
    if (event.settings.requirePolicyAck && activePolicies.length > 0 && !ack) {
      toast('Please read and accept the event policies before submitting.', 'error');
      return;
    }
    if (boothsEnabled && boothIds.length === 0 && event.status !== 'waitlist') {
      toast('Please choose a booth on the floor plan.', 'error');
      return;
    }
    setBusy(true);
    try {
      // 1. Upload any files, photos and signatures.
      const data: Record<string, unknown> = {};
      let name = '', email = '', phone = '';
      for (const f of event.form_schema) {
        if (isContentField(f) || !isVisible(f, values)) continue;
        let v = values[f.id];
        if (v === undefined || v === null || v === '') continue;

        if ((f.type === 'file' || f.type === 'photo') && v instanceof File) {
          v = await uploadVendorFile(v, event.id);
        } else if (f.type === 'signature' && typeof v === 'string' && v.startsWith('data:')) {
          v = await uploadVendorFile(dataUrlToBlob(v), event.id, 'signature.png');
        } else if (f.type === 'multiple_choice' && v === '__other__') {
          v = `Other: ${values[`${f.id}__other`] ?? ''}`;
        } else if (f.type === 'number' && f.collectNames) {
          const names = String(values[`${f.id}__names`] ?? '')
            .split('\n').map((x) => x.trim()).filter(Boolean).join(', ');
          if (names) v = `${v} (${names})`;
        }

        data[f.id] = v;
        const str = typeof v === 'string' ? v : '';
        if (f.mapTo === 'name' && !name) name = str;
        if (f.mapTo === 'email' && !email) email = str;
        if (f.mapTo === 'phone' && !phone) phone = str;
      }
      if (!email) {
        const emailField = event.form_schema.find((f) => f.type === 'email');
        email = emailField ? String(values[emailField.id] ?? '') : '';
      }
      if (!name) {
        const firstText = event.form_schema.find((f) => f.type === 'short_text');
        name = firstText ? String(values[firstText.id] ?? '') : '';
      }

      // 2. Submit through the guarded database function.
      const { data: result, error } = await supabase.rpc('submit_registration', {
        p_event_id: event.id,
        p_name: name || null,
        p_email: email,
        p_phone: phone || null,
        p_data: data,
        p_booth_id: boothsEnabled ? (boothIds[0] ?? null) : null,
        p_booth_ids: boothsEnabled && boothIds.length > 0 ? boothIds : null,
        p_ack: ack || !event.settings.requirePolicyAck || activePolicies.length === 0,
        p_hp: hpRef.current?.value ?? '',
        p_elapsed_seconds: Math.floor((Date.now() - startedAt.current) / 1000),
      });
      if (error) throw error;
      const res = result as unknown as SubmitResult;

      // 3. Ask the email relay to send the confirmation (fire and forget).
      const relayUrl = campus?.webhook_url ?? appSettings?.webhook_url;
      if (event.email_template.enabled && relayUrl) {
        void fetch(relayUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ reference: res.reference }),
        }).catch(() => undefined);
      }

      const menu = event.form_schema
        .filter((f) => f.type === 'menu_quantity')
        .map((f) => {
          const v = values[f.id] as Record<string, number> | undefined;
          const lines = Object.entries(v ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} x ${n}`);
          return lines.length > 0 ? { label: f.label, lines } : null;
        })
        .filter((x): x is { label: string; lines: string[] } => !!x);

      navigate(`/e/${event.slug}/success/${res.reference}`, { state: { result: res, menu } });
    } catch (err) {
      console.error('Registration submit failed:', err);
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="event-theme event-theme-page min-h-screen pb-16" style={themeStyle(t)}>
      <a href="#registration-form" className="skip-link">Skip to the registration form</a>

      {t.animations && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] overflow-hidden" aria-hidden="true">
          <span className="ev-aurora left-[-10%] top-[8%] h-72 w-72" style={{ background: 'var(--ev-primary)' }} />
          <span className="ev-aurora ev-aurora-2 right-[-8%] top-[22%] h-80 w-80" style={{ background: 'var(--ev-secondary)' }} />
        </div>
      )}
      {event.branding.background_url && (
        <div
          className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-15"
          style={{ backgroundImage: `url(${event.branding.background_url})` }}
          aria-hidden="true"
        />
      )}

      {/* Banner */}
      <header className="relative">
        {event.branding.banner_url ? (
          <img src={event.branding.banner_url} alt="" className="block h-auto w-full" />
        ) : (
          <div className="h-40 w-full sm:h-52" style={{ background: `linear-gradient(120deg, ${t.primary}, ${t.accent})` }} />
        )}
      </header>

      <motion.div {...anim} className="relative mx-auto mt-8 max-w-3xl px-4">
        <div className="text-center">
          {!event.branding.hide_logo && (
            <img src={logo} alt="School logo" className="mx-auto mb-5 h-14 w-auto max-w-[70vw] object-contain sm:h-16" />
          )}
          <motion.h1
            className={`ev-title-fluid font-extrabold ${t.animations ? 'ev-sheen' : ''}`}
            style={{ color: 'var(--ev-title)' }}
            initial={t.animations ? { opacity: 0, y: 22, scale: 0.97 } : false}
            animate={t.animations ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ type: 'spring', stiffness: 130, damping: 16 }}
          >
            {event.name}
          </motion.h1>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {([
              event.event_date && { icon: CalendarDays, text: `${formatDate(event.event_date)}${event.end_date ? ` to ${formatDate(event.end_date, 'd MMMM yyyy')}` : ''}` },
              formatTimeRange(event.start_time, event.end_time) && { icon: Clock, text: formatTimeRange(event.start_time, event.end_time) },
              event.location && { icon: MapPin, text: event.location },
            ].filter(Boolean) as Array<{ icon: typeof Clock; text: string }>).map((item, i) => (
              <motion.span
                key={item.text}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-1.5 text-sm font-medium shadow-sm backdrop-blur-sm"
                initial={t.animations ? { opacity: 0, y: 12 } : false}
                animate={t.animations ? { opacity: 1, y: 0 } : undefined}
                transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 160, damping: 18 }}
                whileHover={t.animations ? { y: -3 } : undefined}
              >
                <item.icon className="h-4 w-4" style={{ color: 'var(--ev-primary)' }} />
                {item.text}
              </motion.span>
            ))}
          </div>

          {t.animations && windowState === 'open' && (
            <motion.a
              href="#registration-form"
              className="mt-6 inline-flex flex-col items-center gap-1 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--ev-primary)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              Register below
              <ChevronDown className="ev-bob h-5 w-5" aria-hidden="true" />
            </motion.a>
          )}
        </div>

        {event.branding.header_url && (
          <img src={event.branding.header_url} alt="" className="mt-6 w-full rounded-2xl object-cover" style={{ borderRadius: 'var(--ev-radius)' }} />
        )}

        {event.description && (
          <motion.div {...reveal} className="ev-card mt-6 p-5">
            <div
              className="ev-rich text-sm leading-relaxed opacity-90"
              dangerouslySetInnerHTML={{ __html: richToHtml(event.description) }}
            />
          </motion.div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr]">
          {event.branding.poster_url && (
            <motion.img
              {...reveal}
              src={event.branding.poster_url}
              alt={`${event.name} poster`}
              className="block h-auto w-full rounded-2xl shadow-card"
              style={{ borderRadius: 'var(--ev-radius)' }}
            />
          )}
        </div>

        {/* Waitlist / closed notices */}
        {event.status === 'waitlist' && windowState === 'open' && (
          <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This event is currently accepting waitlist registrations only.
          </div>
        )}

        {windowState !== 'open' ? (
          <div className="ev-card mt-6 p-8 text-center shadow-card">
            <p className="text-lg font-semibold" style={{ color: 'var(--ev-primary)' }}>
              {windowState === 'not_open' ? 'Registration has not opened yet' : 'Registration is closed'}
            </p>
            <p className="mt-1 text-sm opacity-70">
              {windowState === 'not_open' && event.reg_opens_at
                ? `Registration opens on ${formatDate(event.reg_opens_at.slice(0, 10))}.`
                : 'Thank you for your interest in this event.'}
            </p>
          </div>
        ) : (
          <>
            {/* Policies */}
            {activePolicies.length > 0 && (
              <motion.section {...reveal} className="ev-card ev-accent-top mt-6 space-y-4 p-5" aria-labelledby="policies-heading">
                <h2 id="policies-heading" className="flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--ev-heading)' }}>
                  <ShieldCheck className="h-5 w-5" /> Event policies
                </h2>
                <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-2">
                  {activePolicies.map((p) => (
                    <div key={p.id}>
                      <h3 className="text-sm font-semibold">{p.title}</h3>
                      <div
                        className="ev-rich mt-1 text-sm opacity-80"
                        dangerouslySetInnerHTML={{ __html: richToHtml(p.content) }}
                      />
                      {p.image_url && (
                        <img
                          src={p.image_url}
                          alt={`${p.title} infographic`}
                          className="mt-2 block h-auto w-full rounded-xl"
                          loading="lazy"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Booth picker */}
            {boothsEnabled && (
              <motion.section {...reveal} className="ev-card ev-accent-top mt-6 space-y-3 p-5" aria-labelledby="booth-heading">
                <h2 id="booth-heading" className="text-lg font-bold" style={{ color: 'var(--ev-heading)' }}>
                  {event.settings.boothSelectionLabel || 'Select your booth'}
                </h2>
                {event.floor_plan.note && (
                  <div
                    className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                    style={{ background: 'color-mix(in srgb, var(--ev-secondary) 22%, transparent)' }}
                    role="note"
                  >
                    <Info className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--ev-primary)' }} aria-hidden="true" />
                    <div
                      className="ev-rich text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: richToHtml(event.floor_plan.note) }}
                    />
                  </div>
                )}
                <BoothPicker
                  eventId={event.id}
                  plan={event.floor_plan}
                  value={boothIds}
                  maxBooths={Math.max(1, event.settings.maxBooths || 1)}
                  vendorType={vendorTypeValue || undefined}
                  onChange={(ids, booths) => { setBoothIds(ids); setBoothInfos(booths); }}
                  onSelectionLost={(b) => toast(`Booth ${b.label || b.number} was just taken by someone else. Please pick another.`, 'info')}
                  onLimitReached={() => toast(`You can choose up to ${event.settings.maxBooths} booths. Unselect one first.`, 'info')}
                />
              </motion.section>
            )}

            {/* Form */}
            <motion.section {...reveal} id="registration-form" className="ev-card ev-accent-top mt-6 scroll-mt-6 p-5 sm:p-7">
              <h2 className="mb-5 text-lg font-bold" style={{ color: 'var(--ev-heading)' }}>Registration form</h2>
              {/* Honeypot: invisible to humans, irresistible to bots */}
              <input
                ref={hpRef} type="text" name="website" tabIndex={-1} autoComplete="off"
                className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true"
              />
              <FormRenderer
                fields={event.form_schema}
                theme={t}
                busy={busy}
                onValuesChange={handleValuesChange}
                onSubmit={handleSubmit}
                submitLabel={event.status === 'waitlist' ? 'Join the waitlist' : 'Submit registration'}
                beforeSubmit={
                  event.settings.requirePolicyAck && activePolicies.length > 0 ? (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded"
                        style={{ accentColor: 'var(--ev-primary)' }}
                        aria-required="true"
                      />
                      <span>{event.settings.policyAckText}</span>
                    </label>
                  ) : undefined
                }
                submitDisabled={event.settings.requirePolicyAck && activePolicies.length > 0 && !ack}
              />
              {boothsEnabled && boothInfos.length > 0 && (
                <p className="mt-3 text-center text-xs opacity-70">
                  You are registering for: {boothInfos.map((b) => `${b.label} ${b.number}`.trim()).join(' + ')}
                </p>
              )}
            </motion.section>
          </>
        )}

        <footer className="mt-10 text-center text-xs opacity-60">
          {campus?.school_name ?? appSettings?.school_name ?? 'HeadStart International School Phuket'}
        </footer>
      </motion.div>
    </main>
  );
}
