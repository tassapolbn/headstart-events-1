import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import type { PolicySection } from '@/lib/types';
import { richToHtml } from '@/components/ui/RichTextArea';
import { activePolicies, sectionAckText } from './policyAcks';

/**
 * Height of the "peek" a collapsed section shows. Tall enough to prove there is
 * real content worth opening, short enough that ten policies still fit on one
 * screen, so the page never reads as a wall of text.
 */
const PEEK_PX = 168;
const REVEAL_EVENT = 'headstart:reveal-policy';

export function policyDomId(id: string): string {
  return `policy-${id}`;
}

/** Open a policy section and bring it into view (used by the submit-area checklist). */
export function revealPolicy(id: string) {
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: id }));
}

/** Bring the final acknowledgment into view and flash it. */
export function revealFinalAck() {
  const el = document.getElementById('policy-final');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ev-flash');
  window.setTimeout(() => el.classList.remove('ev-flash'), 1500);
}

// ------------------------------------------------------------------
// One policy section
// ------------------------------------------------------------------
function PolicyCard({ section, index, expanded, onExpandedChange, checked, onCheckedChange }: {
  section: PolicySection;
  index: number;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const nudgeTimer = useRef(0);
  const [fullHeight, setFullHeight] = useState(0);
  const [read, setRead] = useState(false);
  const [nudge, setNudge] = useState(false);
  /**
   * An infographic that has not loaded yet has zero height, which would put the
   * end marker inside the peek and hand out "read" credit for a section the
   * vendor has not actually seen. Wait for the artwork before judging.
   */
  const [mediaReady, setMediaReady] = useState(!section.image_url);

  /**
   * Keep the true content height in sync. Reading `scrollHeight` off the clipped
   * body reports the full height whatever the current clamp is, and watching the
   * inner wrapper (never the clipped box) keeps the observer from reacting to
   * our own max-height changes.
   */
  useLayoutEffect(() => {
    const measure = () => setFullHeight(bodyRef.current?.scrollHeight ?? 0);
    measure();
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  /**
   * Reading is verified by a marker at the very end of the text. While the card
   * is collapsed the marker is clipped away by `overflow:hidden`, so it can
   * never fire early; a section short enough to fit the peek marks itself read
   * at once, which is exactly right - there was nothing left to scroll.
   */
  useEffect(() => {
    if (read || !mediaReady) return;
    if (typeof IntersectionObserver === 'undefined') { setRead(true); return; }
    const el = endRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setRead(true); },
      { threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [read, mediaReady]);

  // An image that never fires load or error (blocked, offline) must not be able
  // to leave the agreement locked forever.
  useEffect(() => {
    if (mediaReady) return;
    const t = window.setTimeout(() => setMediaReady(true), 4000);
    return () => window.clearTimeout(t);
  }, [mediaReady]);

  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);

  const hasMore = fullHeight > PEEK_PX + 24;
  // Undefined means "not configured yet", and the read gate is the safer default
  // for a section that asks for its own signature.
  const locked = !!section.requireAck && section.requireRead !== false && !read;
  const clamped = hasMore && !expanded;

  /** A locked box does not just refuse: it opens the section and says what is left. */
  function refuse() {
    onExpandedChange(true);
    setNudge(true);
    window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => setNudge(false), 2600);
  }

  return (
    <li
      id={policyDomId(section.id)}
      className={`ev-policy scroll-mt-24 ${checked ? 'is-done' : ''}`}
    >
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        className="ev-policy-head flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
      >
        <span className="ev-policy-index" aria-hidden="true">
          {checked ? <Check className="h-4 w-4" strokeWidth={3} /> : String(index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight">
            {section.title || 'Policy'}
          </span>
          <span className="mt-0.5 block text-xs opacity-60">
            {!section.requireAck
              ? 'For your information'
              : checked
                ? 'Accepted'
                : locked
                  ? 'Read to the end to accept'
                  : 'Agreement required'}
          </span>
        </span>
        {section.requireAck && (
          <span className={`ev-policy-chip ${checked ? 'is-done' : ''}`}>
            {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : <Lock className="h-3 w-3" />}
            <span className="hidden sm:inline">{checked ? 'Accepted' : 'Required'}</span>
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-50 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div className="relative px-4 sm:px-5">
        <div
          ref={bodyRef}
          className="ev-policy-body"
          style={{ maxHeight: clamped ? `${PEEK_PX}px` : fullHeight ? `${fullHeight}px` : undefined }}
        >
          <div ref={innerRef} className="pb-4">
            {section.content && (
              <div
                className="ev-rich text-sm leading-relaxed opacity-85"
                dangerouslySetInnerHTML={{ __html: richToHtml(section.content) }}
              />
            )}
            {section.image_url && (
              <img
                src={section.image_url}
                alt={`${section.title} infographic`}
                className="mt-3 block h-auto w-full rounded-xl"
                loading="lazy"
                onLoad={() => setMediaReady(true)}
                onError={() => setMediaReady(true)}
              />
            )}
            {/* End-of-section marker: reaching this is what unlocks the agreement. */}
            <div ref={endRef} aria-hidden="true" className="h-px w-full" />
          </div>
        </div>
        {clamped && <span className="ev-policy-fade" aria-hidden="true" />}
      </div>

      {hasMore && (
        <div className="px-4 pb-3 sm:px-5">
          <button type="button" onClick={() => onExpandedChange(!expanded)} className="ev-policy-more">
            {expanded ? 'Show less' : 'Read the full section'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {section.requireAck && (
        <div className="px-4 pb-4 sm:px-5">
          <label
            className={`ev-ack ${checked ? 'is-checked' : ''} ${locked ? 'is-locked' : ''}`}
            onClick={(e) => { if (locked) { e.preventDefault(); refuse(); } }}
          >
            <input
              type="checkbox"
              className="ev-ack-box"
              checked={checked}
              onChange={() => onCheckedChange(!checked)}
              aria-describedby={locked ? `${policyDomId(section.id)}-lock` : undefined}
            />
            <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{sectionAckText(section)}</span>
            {locked && <Lock className="mt-0.5 h-4 w-4 shrink-0 opacity-45" aria-hidden="true" />}
          </label>
          {locked && (
            <p
              id={`${policyDomId(section.id)}-lock`}
              className={`mt-1.5 text-xs ${nudge ? 'ev-policy-nudge font-semibold' : 'opacity-60'}`}
            >
              Scroll through this section to the end, then the box can be ticked.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------
// The consent panel
// ------------------------------------------------------------------
export function PolicyConsent({
  policies, accepted, onAcceptedChange,
  requireOverall, overallText, overallAccepted, onOverallChange,
}: {
  policies: PolicySection[];
  accepted: Record<string, boolean>;
  onAcceptedChange: (next: Record<string, boolean>) => void;
  requireOverall: boolean;
  overallText: string;
  overallAccepted: boolean;
  onOverallChange: (v: boolean) => void;
}) {
  const sections = activePolicies(policies);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // The submit-area checklist asks us to bring one agreement into view.
  useEffect(() => {
    function onReveal(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      setOpen((prev) => ({ ...prev, [id]: true }));
      requestAnimationFrame(() => {
        const el = document.getElementById(policyDomId(id));
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ev-flash');
        window.setTimeout(() => el.classList.remove('ev-flash'), 1500);
      });
    }
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, []);

  if (sections.length === 0) return null;

  const ackList = sections.filter((p) => p.requireAck);
  const readGated = ackList.some((p) => p.requireRead !== false);
  const sectionsDone = ackList.filter((p) => accepted[p.id]).length;
  const remaining = ackList.length - sectionsDone;
  const total = ackList.length + (requireOverall ? 1 : 0);
  const done = sectionsDone + (requireOverall && overallAccepted ? 1 : 0);
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  const allOpen = sections.every((p) => open[p.id]);

  return (
    <section className="ev-card ev-accent-top mt-6 overflow-hidden" aria-labelledby="policies-heading">
      <header className="flex flex-wrap items-center gap-3 px-4 pb-4 pt-6 sm:px-6">
        <span className="ev-policy-crest" aria-hidden="true"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 id="policies-heading" className="text-lg font-bold leading-tight" style={{ color: 'var(--ev-heading)' }}>
            Event policies &amp; agreements
          </h2>
          <p className="mt-0.5 text-xs opacity-65">
            {total === 0
              ? 'Please read the information below before you register.'
              : readGated
                ? 'Open each section, read it to the end, then tick to accept.'
                : 'Read each section, then tick to accept.'}
          </p>
        </div>
        {sections.length > 1 && (
          <button
            type="button"
            onClick={() => setOpen(allOpen ? {} : Object.fromEntries(sections.map((p) => [p.id, true] as const)))}
            className="ev-policy-more shrink-0"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </header>

      {total > 0 && (
        <div className="px-4 pb-4 sm:px-6">
          <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold">
            <span style={{ color: 'var(--ev-heading)' }}>
              {done} of {total} agreement{total === 1 ? '' : 's'} accepted
            </span>
            <span className="opacity-55">{pct}%</span>
          </div>
          <div
            className="ev-progress"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Agreements accepted"
          >
            <span className="ev-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <ol className="space-y-2.5 px-3 pb-5 sm:px-6">
        {sections.map((p, i) => (
          <PolicyCard
            key={p.id}
            section={p}
            index={i}
            expanded={!!open[p.id]}
            onExpandedChange={(v) => setOpen((prev) => ({ ...prev, [p.id]: v }))}
            checked={!!accepted[p.id]}
            onCheckedChange={(v) => {
              onAcceptedChange({ ...accepted, [p.id]: v });
              // Withdrawing a section agreement invalidates the blanket one, so
              // the final tick can never outlive the sections it stands for.
              if (!v && overallAccepted) onOverallChange(false);
            }}
          />
        ))}
      </ol>

      {requireOverall && (
        <div id="policy-final" className="ev-policy-final scroll-mt-24 px-4 py-5 sm:px-6">
          <label
            className={`ev-ack ev-ack-final ${overallAccepted ? 'is-checked' : ''} ${remaining > 0 ? 'is-locked' : ''}`}
            onClick={(e) => {
              if (remaining > 0) {
                e.preventDefault();
                const next = ackList.find((p) => !accepted[p.id]);
                if (next) revealPolicy(next.id);
              }
            }}
          >
            <input
              type="checkbox"
              className="ev-ack-box"
              checked={overallAccepted}
              onChange={() => onOverallChange(!overallAccepted)}
              aria-required="true"
            />
            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{overallText}</span>
          </label>
          {remaining > 0 && (
            <p className="mt-1.5 text-xs opacity-60">
              Accept the {remaining} remaining section{remaining === 1 ? '' : 's'} above first.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
