import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Clock, MapPin, ShieldCheck } from 'lucide-react';
import type { FieldValues } from 'react-hook-form';
import { supabase } from '@/lib/supabase';
import type { Booth, EventRecord, SubmitResult } from '@/lib/types';
import { normalizeEvent } from '@/hooks/useEvent';
import { useAppSettings } from '@/hooks/useAppSettings';
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
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [boothIds, setBoothIds] = useState<string[]>([]);
  const [boothInfos, setBoothInfos] = useState<Booth[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const hpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('events').select('*').eq('slug', slug).maybeSingle();
      if (!data) setNotFound(true);
      else setEvent(normalizeEvent(data));
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
  const activePolicies = event.policies.filter((p) => p.enabled && (p.title || p.content));
  const logo = event.branding.logo_url ?? appSettings?.logo_url ?? '/logo.svg';
  const anim = t.animations
    ? { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }
    : { initial: false as const, animate: undefined };

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
      if (event.email_template.enabled && appSettings?.webhook_url) {
        void fetch(appSettings.webhook_url, {
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
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="event-theme min-h-screen pb-16" style={themeStyle(t)}>
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
        {!event.branding.hide_logo && (
          <div className="absolute inset-x-0 -bottom-12 flex justify-center sm:-bottom-16">
            <img src={logo} alt="School logo" className="h-28 w-auto max-w-[60vw] object-contain sm:h-44" style={{ filter: 'drop-shadow(0 4px 12px rgba(14,33,53,0.3))' }} />
          </div>
        )}
      </header>

      <motion.div {...anim} className={`relative mx-auto max-w-3xl px-4 ${event.branding.hide_logo ? "mt-8" : "mt-16 sm:mt-24"}`}>
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl" style={{ color: 'var(--ev-primary)' }}>{event.name}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-sm opacity-80">
            {event.event_date && (
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(event.event_date)}{event.end_date ? ` to ${formatDate(event.end_date, 'd MMMM yyyy')}` : ''}</span>
            )}
            {formatTimeRange(event.start_time, event.end_time) && (
              <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" />{formatTimeRange(event.start_time, event.end_time)}</span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{event.location}</span>
            )}
          </div>
        </div>

        {event.branding.header_url && (
          <img src={event.branding.header_url} alt="" className="mt-6 w-full rounded-2xl object-cover" style={{ borderRadius: 'var(--ev-radius)' }} />
        )}

        {event.description && (
          <div className="ev-card mt-6 p-5 shadow-card">
            <div
              className="ev-rich text-sm leading-relaxed opacity-90"
              dangerouslySetInnerHTML={{ __html: richToHtml(event.description) }}
            />
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr]">
          {event.branding.poster_url && (
            <img src={event.branding.poster_url} alt={`${event.name} poster`} className="block h-auto w-full rounded-2xl shadow-card" style={{ borderRadius: 'var(--ev-radius)' }} />
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
              <motion.section {...anim} className="ev-card mt-6 space-y-4 p-5 shadow-card" aria-labelledby="policies-heading">
                <h2 id="policies-heading" className="flex items-center gap-2 text-lg font-bold" style={{ color: 'var(--ev-primary)' }}>
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
              <motion.section {...anim} className="ev-card mt-6 space-y-3 p-5 shadow-card" aria-labelledby="booth-heading">
                <h2 id="booth-heading" className="text-lg font-bold" style={{ color: 'var(--ev-primary)' }}>
                  {event.settings.boothSelectionLabel || 'Select your booth'}
                </h2>
                <BoothPicker
                  eventId={event.id}
                  plan={event.floor_plan}
                  value={boothIds}
                  maxBooths={Math.max(1, event.settings.maxBooths || 1)}
                  onChange={(ids, booths) => { setBoothIds(ids); setBoothInfos(booths); }}
                  onSelectionLost={(b) => toast(`Booth ${b.label || b.number} was just taken by someone else. Please pick another.`, 'info')}
                  onLimitReached={() => toast(`You can choose up to ${event.settings.maxBooths} booths. Unselect one first.`, 'info')}
                />
              </motion.section>
            )}

            {/* Form */}
            <motion.section {...anim} className="ev-card mt-6 p-5 shadow-card sm:p-7">
              <h2 className="mb-5 text-lg font-bold" style={{ color: 'var(--ev-primary)' }}>Registration form</h2>
              {/* Honeypot: invisible to humans, irresistible to bots */}
              <input
                ref={hpRef} type="text" name="website" tabIndex={-1} autoComplete="off"
                className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true"
              />
              <FormRenderer
                fields={event.form_schema}
                theme={t}
                busy={busy}
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
          {appSettings?.school_name ?? 'HeadStart International School Phuket'}
        </footer>
      </motion.div>
    </main>
  );
}
