import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/basics';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';
import { EventBanner, EventIntroduction } from '@/components/event-page/EventIntroduction';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { pageDesign, PAGE_DESIGN_DEFAULTS } from '@/lib/pageDesign';
import { themeStyle } from '@/lib/theme';
import { formCopy } from '@/lib/formCopy';
import { useCampus } from '@/context/CampusContext';
import type { EventTheme } from '@/lib/types';
import type { TabProps } from '../EventEditorPage';

export default function PageDesignTab({ draft, update }: TabProps) {
  const [mobile, setMobile] = useState(false);
  const { campuses } = useCampus();
  const campus = campuses.find(c => c.id === draft.campus_id);
  const p = pageDesign(draft.theme);
  const copy = formCopy(draft);
  const set = (patch: Partial<EventTheme>) => update({ theme: { ...draft.theme, ...patch } });
  const settings = (patch: Partial<typeof draft.settings>) => update({ settings: { ...draft.settings, ...patch } });
  const ranges = [
    ['pageWidth', 'Content width', 560, 1120, 'px'],
    ['bannerHeight', 'Banner height (0 uses original image)', 0, 600, 'px'],
    ['bannerPosition', 'Banner vertical focal point', 0, 100, '%'],
    ['posterWidth', 'Poster width', 30, 100, '%'],
    ['logoHeight', 'Logo height', 32, 160, 'px'],
    ['backgroundOpacity', 'Background image visibility', 0, 60, '%'],
  ] as const;
  return <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
    <div className="space-y-5">
      <Card title="Page composition">
        <p className="mb-5 text-sm text-slate-500">Shape the page around your event. Use Branding & Theme for images, colours and fonts.</p>
        <div className="space-y-5">
          <Field label="Title alignment" htmlFor="page-align"><Select id="page-align" value={p.titleAlign} onChange={e => set({ titleAlign: e.target.value as 'left' | 'center' })}><option value="center">Centred</option><option value="left">Left aligned</option></Select></Field>
          <Field label="Banner image fit" htmlFor="page-fit"><Select id="page-fit" value={p.bannerFit} onChange={e => set({ bannerFit: e.target.value as 'cover' | 'contain' })}><option value="cover">Fill and crop</option><option value="contain">Show the entire image</option></Select></Field>
          {ranges.map(([key, label, min, max, unit]) => <Field key={key} label={`${label}: ${p[key]}${unit}`} htmlFor={`page-${key}`}><input id={`page-${key}`} type="range" min={min} max={max} step={1} value={p[key]} onChange={e => set({ [key]: Number(e.target.value) })} className="w-full accent-navy-700" /></Field>)}
          <Switch checked={p.showEventDetails} onChange={showEventDetails => set({ showEventDetails })} label="Show date, time and location" description="Hide these details for a simpler survey introduction." />
          <button type="button" onClick={() => set(PAGE_DESIGN_DEFAULTS)} className="text-sm font-semibold text-navy-700 underline underline-offset-4">Reset page composition</button>
        </div>
      </Card>
      <Card title="Public wording"><div className="space-y-4">
        <Field label="Introduction below the title" htmlFor="page-intro"><Textarea id="page-intro" rows={3} value={draft.settings.introText ?? ''} onChange={e => settings({ introText: e.target.value })} placeholder="A short welcome or instructions for visitors" /></Field>
        <Field label="Form heading" htmlFor="page-heading"><Input id="page-heading" value={draft.settings.formHeading ?? ''} placeholder={copy.formHeading} onChange={e => settings({ formHeading: e.target.value })} /></Field>
        <Field label="Submit button" htmlFor="page-submit"><Input id="page-submit" value={draft.settings.submitLabel ?? ''} placeholder={copy.submitLabel} onChange={e => settings({ submitLabel: e.target.value })} /></Field>
        <Field label="Footer text" htmlFor="page-footer" hint="Leave blank to use the campus name."><Input id="page-footer" value={draft.settings.footerText ?? ''} onChange={e => settings({ footerText: e.target.value })} /></Field>
      </div></Card>
    </div>
    <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-card xl:sticky xl:top-4" aria-label="Unsaved page preview">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
        <div><h2 className="text-sm font-bold text-navy-800">Live page preview</h2><p className="text-xs text-slate-500">Includes unsaved changes. Submission is disabled.</p></div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {[false, true].map(m => <button key={String(m)} type="button" aria-pressed={mobile === m} aria-label={m ? 'Mobile preview' : 'Desktop preview'} onClick={() => setMobile(m)} className={`rounded-lg p-2 ${mobile === m ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500'}`}>{m ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}</button>)}
        </div>
      </div>
      <div className="max-h-[76vh] overflow-auto p-3">
        <div className="event-theme relative mx-auto overflow-hidden rounded-xl shadow-sm" style={{ ...themeStyle(draft.theme), width: mobile ? 375 : '100%', maxWidth: '100%' }}>
          {draft.branding.background_url && <div className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${draft.branding.background_url})`, opacity: p.backgroundOpacity / 100 }} />}
          <div className="relative">
            <EventBanner event={draft} />
            <div className="mx-auto px-4 py-6" style={{ maxWidth: p.pageWidth }}>
              <EventIntroduction event={draft} logo={draft.branding.logo_url ?? campus?.logo_url ?? '/logo.svg'} />
              <div className="ev-card ev-accent-top mt-6 p-5">
                <h2 className="mb-5 text-lg font-bold" style={{ color: 'var(--ev-heading)' }}>{draft.settings.formHeading?.trim() || copy.formHeading}</h2>
                <fieldset disabled className="min-w-0"><FormRenderer fields={draft.form_schema} theme={draft.theme} onSubmit={() => undefined} submitDisabled submitLabel={!copy.isSurvey && draft.status === 'waitlist' ? 'Join the waitlist' : draft.settings.submitLabel?.trim() || copy.submitLabel} /></fieldset>
              </div>
              <p className="mt-5 text-center text-xs opacity-60">{draft.settings.footerText?.trim() || campus?.school_name || 'HeadStart International School Phuket'}</p>
            </div>
          </div>
        </div>
      </div>
      <p className="border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">Preview of appearance and questions. Policies, booth selection and opening rules remain active on the public page. Desktop preview fits the available workspace.</p>
    </section>
  </div>;
}
