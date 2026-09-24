import { CalendarDays, ChevronDown, Clock, MapPin } from 'lucide-react';
import type { EventRecord } from '@/lib/types';
import { pageDesign } from '@/lib/pageDesign';
import { formatDate, formatTimeRange } from '@/lib/utils';
import { formCopy } from '@/lib/formCopy';
import { richToHtml } from '@/components/ui/RichTextArea';

export function EventBanner({ event }: { event: EventRecord }) {
  const p = pageDesign(event.theme);
  return <header className="relative overflow-hidden" style={{ background: event.theme.primary }}>
    {event.branding.banner_url ? <img src={event.branding.banner_url} alt="" className="block w-full" style={{ height: p.bannerHeight || 'auto', objectFit: p.bannerFit, objectPosition: `50% ${p.bannerPosition}%` }} />
      : <div className="h-40 w-full sm:h-52" style={{ ...(p.bannerHeight ? { height: p.bannerHeight } : {}), background: `linear-gradient(120deg, ${event.theme.primary}, ${event.theme.accent})` }} />}
  </header>;
}

/** Shared by the public page and unsaved design preview. */
export function EventIntroduction({ event, logo, showJump = false }: { event: EventRecord; logo: string; showJump?: boolean }) {
  const p = pageDesign(event.theme);
  return <>
    <div style={{ textAlign: p.titleAlign }}>
      {!event.branding.hide_logo && <img src={logo} alt="School logo" className={`mb-5 w-auto max-w-full object-contain ${p.titleAlign === 'center' ? 'mx-auto' : ''}`} style={{ height: p.logoHeight }} />}
      <h1 className="ev-title ev-title-fluid break-words font-extrabold" style={{ color: 'var(--ev-title)' }}>{event.name}</h1>
      {event.settings.introText && <p className="mt-3 whitespace-pre-line text-base leading-relaxed opacity-80">{event.settings.introText}</p>}
      {p.showEventDetails && <div className={`mt-4 flex flex-wrap gap-2 ${p.titleAlign === 'center' ? 'justify-center' : ''}`}>
        {([
          event.event_date && { icon: CalendarDays, text: `${formatDate(event.event_date)}${event.end_date ? ` to ${formatDate(event.end_date, 'd MMMM yyyy')}` : ''}` },
          formatTimeRange(event.start_time, event.end_time) && { icon: Clock, text: formatTimeRange(event.start_time, event.end_time) },
          event.location && { icon: MapPin, text: event.location },
        ].filter(Boolean) as Array<{ icon: typeof Clock; text: string }>).map(({ icon: Icon, text }) => <span key={text} className="ev-card inline-flex items-center gap-2 px-3 py-2 text-sm"><Icon className="h-4 w-4 shrink-0" /><span>{text}</span></span>)}
      </div>}
      {showJump && <a href="#registration-form" className="ev-btn mt-5 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold">{formCopy(event).scrollCue}<ChevronDown className="h-4 w-4" /></a>}
    </div>
    {event.branding.header_url && <img src={event.branding.header_url} alt="" className="mt-6 w-full" style={{ borderRadius: 'var(--ev-radius)' }} />}
    {event.description && <div className="ev-card mt-6 p-5"><div className="ev-rich text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: richToHtml(event.description) }} /></div>}
    {event.branding.poster_url && <img src={event.branding.poster_url} alt={`${event.name} poster`} className="mx-auto mt-6 block h-auto shadow-card" style={{ width: `${p.posterWidth}%`, borderRadius: 'var(--ev-radius)' }} />}
  </>;
}
