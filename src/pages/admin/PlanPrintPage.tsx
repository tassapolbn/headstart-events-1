import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Booth, Registration } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { useAppSettings } from '@/hooks/useAppSettings';
import { boothStatusMeta, isMarkerStatus } from '@/lib/boothColors';
import { boothFill } from '@/lib/boothColors';
import { formatDate, formatTimeRange } from '@/lib/utils';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { useToast } from '@/context/ToastContext';
import { Button, Card, EmptyState, PageLoader } from '@/components/ui/basics';
import { Field, Select, Switch } from '@/components/ui/inputs';
import { Legend } from '@/components/floor-plan/Legend';

type Paper = 'a4-landscape' | 'a4-portrait' | 'a3-landscape' | 'a3-portrait';
type Placement = 'on' | 'beside';

const paperCss: Record<Paper, string> = {
  'a4-landscape': '@page { size: A4 landscape; margin: 10mm; }',
  'a4-portrait': '@page { size: A4 portrait; margin: 10mm; }',
  'a3-landscape': '@page { size: A3 landscape; margin: 10mm; }',
  'a3-portrait': '@page { size: A3 portrait; margin: 10mm; }',
};

/** Split a name into at most `maxLines` lines of roughly `perLine` characters. */
function wrapName(name: string, perLine: number, maxLines: number): string[] {
  const words = name.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= perLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = w;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) return [];
  const last = lines[lines.length - 1];
  if (last.length > perLine + 2) lines[lines.length - 1] = `${last.slice(0, perLine)}…`;
  return lines;
}

export default function PlanPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading: eventLoading } = useEvent(id);
  const appSettings = useAppSettings();
  const { toast } = useToast();

  const [booths, setBooths] = useState<Booth[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  const [paper, setPaper] = useState<Paper>('a3-landscape');
  const [placement, setPlacement] = useState<Placement>('on');
  const [nameSource, setNameSource] = useState<string>('__name__');
  const [showEmpty, setShowEmpty] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showNumbers, setShowNumbers] = useState(true);
  const [nameSize, setNameSize] = useState(22);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const [b, r] = await Promise.all([
        supabase.from('booths').select('*').eq('event_id', id),
        supabase
          .from('registrations')
          .select('*, registration_booths(booth_id, booths(label, number))')
          .eq('event_id', id)
          .in('status', ['confirmed', 'pending']),
      ]);
      if (b.error) toast(`Could not load the floor plan: ${b.error.message}`, 'error');
      if (r.error) toast(`Could not load registrations: ${r.error.message}`, 'error');
      setBooths((b.data ?? []) as Booth[]);
      setRegs((r.data ?? []) as Registration[]);
      setLoading(false);
    }
    void load();
  }, [id]);

  /** Which text fields can supply the display name (e.g. Vendor Name). */
  const textFields = useMemo(
    () => (event?.form_schema ?? []).filter((f) => !isContentField(f) && ['short_text', 'paragraph', 'dropdown'].includes(f.type)),
    [event]
  );

  /** booth id -> display name */
  const namesByBooth = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of regs) {
      const display = nameSource === '__name__'
        ? (r.name ?? '')
        : String(r.data?.[nameSource] ?? r.name ?? '');
      const ids = (r.registration_booths ?? [])
        .map((rb) => rb.booth_id)
        .filter((x): x is string => !!x);
      const all = ids.length > 0 ? ids : (r.booth_id ? [r.booth_id] : []);
      for (const bid of all) {
        if (display.trim()) map.set(bid, display.trim());
      }
    }
    return map;
  }, [regs, nameSource]);

  const plan = event?.floor_plan;
  const bookedCount = booths.filter((b) => namesByBooth.has(b.id)).length;

  if (eventLoading || loading || !event || !plan) return <PageLoader label="Loading the floor plan" />;

  const visibleBooths = booths.filter((b) => !b.hidden && (showEmpty || namesByBooth.has(b.id) || isMarkerStatus(b.status)));

  return (
    <div className="space-y-5">
      <style>{paperCss[paper]}</style>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to={`/admin/events/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-navy-800">Print floor plan</h1>
          <p className="text-sm text-slate-500">{event.name} - {bookedCount} of {booths.length} booths taken</p>
        </div>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Print</Button>
      </div>

      <div className="no-print grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card title="Print options">
          <div className="space-y-4">
            <Field label="Paper size">
              <Select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} aria-label="Paper size">
                <option value="a3-landscape">A3 Landscape (recommended)</option>
                <option value="a3-portrait">A3 Portrait</option>
                <option value="a4-landscape">A4 Landscape</option>
                <option value="a4-portrait">A4 Portrait</option>
              </Select>
            </Field>
            <Field label="Name position" hint="On the booth suits large booths. Beside the booth suits small or crowded layouts.">
              <Select value={placement} onChange={(e) => setPlacement(e.target.value as Placement)} aria-label="Name position">
                <option value="on">On the booth</option>
                <option value="beside">Beside the booth</option>
              </Select>
            </Field>
            <Field label="Name comes from" hint="Usually the stall or vendor name question.">
              <Select value={nameSource} onChange={(e) => setNameSource(e.target.value)} aria-label="Name source">
                <option value="__name__">Registrant name</option>
                {textFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
            </Field>
            <Field label={`Name size: ${nameSize}px`} hint="Larger names may extend past small booths, which keeps them readable on a printed plan.">
              <input
                type="range" min={10} max={48} step={1}
                value={nameSize}
                onChange={(e) => setNameSize(Number(e.target.value))}
                className="w-full accent-navy-700"
                aria-label="Vendor name size"
              />
              <div className="mt-1 flex gap-1.5">
                {[14, 22, 30, 40].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setNameSize(v)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${nameSize === v ? 'border-navy-600 bg-navy-700 text-white' : 'border-slate-300 text-slate-500 hover:border-navy-300'}`}
                  >
                    {v === 14 ? 'Small' : v === 22 ? 'Medium' : v === 30 ? 'Large' : 'Huge'}
                  </button>
                ))}
              </div>
            </Field>
            <Switch checked={showNumbers} onChange={setShowNumbers} label="Show booth numbers" />
            <Switch checked={showEmpty} onChange={setShowEmpty} label="Show empty booths" description="Turn off to print only booths that have been taken." />
            <Switch checked={showLegend} onChange={setShowLegend} label="Show the status legend" />
          </div>
        </Card>

        <Card title="Preview" padded={false}>
          <div className="overflow-auto p-4">
            <PlanSvg
              plan={plan}
              booths={visibleBooths}
              names={namesByBooth}
              placement={placement}
              showNumbers={showNumbers}
              nameSize={nameSize}
              className="mx-auto block h-auto w-full max-w-3xl"
            />
          </div>
        </Card>
      </div>

      {visibleBooths.length === 0 && (
        <EmptyState title="Nothing to print" hint="This event has no booths on the floor plan yet." />
      )}

      {/* Print output */}
      <div className="hidden print:block">
        <div className="mb-3 flex items-end justify-between gap-4 border-b-2 border-[#1a3c5e] pb-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#1a3c5e]">{event.name}</h1>
            <p className="text-sm text-slate-600">
              {formatDate(event.event_date, 'EEEE d MMMM yyyy')}
              {formatTimeRange(event.start_time, event.end_time) && ` - ${formatTimeRange(event.start_time, event.end_time)}`}
              {event.location && ` - ${event.location}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-[#1a3c5e]">{appSettings?.school_name ?? 'HeadStart International School Phuket'}</p>
            <p className="text-xs text-slate-500">{bookedCount} of {booths.length} booths taken - printed {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        <PlanSvg
          plan={plan}
          booths={visibleBooths}
          names={namesByBooth}
          placement={placement}
          showNumbers={showNumbers}
          nameSize={nameSize}
          className="block h-auto w-full"
        />
        {showLegend && (
          <div className="mt-3 border-t border-slate-300 pt-2">
            <Legend compact />
          </div>
        )}
      </div>
    </div>
  );
}

/** The floor plan drawing, shared by the preview and the printed page. */
function PlanSvg({ plan, booths, names, placement, showNumbers, nameSize, className }: {
  plan: NonNullable<ReturnType<typeof useEvent>['event']>['floor_plan'];
  booths: Booth[];
  names: Map<string, string>;
  placement: Placement;
  showNumbers: boolean;
  nameSize: number;
  className?: string;
}) {
  // Extra room on the right when names sit beside the booths, scaled to the text size.
  const pad = placement === 'beside' ? Math.round(nameSize * 13) : 0;

  return (
    <svg
      viewBox={`0 0 ${plan.width + pad} ${plan.height}`}
      className={className}
      role="img"
      aria-label="Floor plan with vendor names"
    >
      <rect x="0" y="0" width={plan.width} height={plan.height} fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
      {plan.background_url && (
        <image href={plan.background_url} x="0" y="0" width={plan.width} height={plan.height} preserveAspectRatio="xMidYMid slice" opacity="0.35" />
      )}

      {[...booths]
        .sort((a, b) => Number(names.has(a.id)) - Number(names.has(b.id)))
        .map((b) => {
        const marker = isMarkerStatus(b.status);
        const name = names.get(b.id);
        const fill = marker ? boothFill(b.status, b.color) : name ? '#e2e8f0' : '#f8fafc';
        const centreX = b.x + b.w / 2;

        // Label chip: white box with a dark border so the name is always
        // readable, whatever colour the booth underneath happens to be.
        const chipFont = nameSize;
        // Wrap to roughly the booth width, but never narrower than 10 characters,
        // so big text stays on two readable lines instead of one long crop.
        const charsPerLine = placement === 'beside'
          ? 22
          : Math.max(10, Math.round((b.w * 1.35) / (chipFont * 0.58)));
        const chipLines = name ? wrapName(name, charsPerLine, 2) : [];
        const lineH = chipFont * 1.15;
        const chipH = chipLines.length * lineH + chipFont * 0.5;
        const longest = Math.max(...chipLines.map((l) => l.length), 1);
        const chipW = placement === 'beside'
          ? pad - 24
          : Math.max(40, longest * chipFont * 0.58 + chipFont * 0.7);
        const chipX = placement === 'beside' ? plan.width + 12 : centreX - chipW / 2;
        const chipY = placement === 'beside'
          ? b.y + b.h / 2 - chipH / 2
          : b.y + b.h / 2 - chipH / 2 + (showNumbers ? 6 : 0);

        return (
          <g key={b.id}>
            <rect
              x={b.x} y={b.y} width={b.w} height={b.h} rx={5}
              fill={fill}
              stroke={marker ? boothFill(b.status, b.color) : name ? '#1a3c5e' : '#94a3b8'}
              strokeWidth={name || marker ? 2 : 1}
              strokeDasharray={!name && !marker ? '5 4' : undefined}
            />

            {marker ? (
              <>
                <text x={centreX} y={b.y + b.h / 2 - 2} textAnchor="middle" fontSize={Math.min(26, b.h / 2.4)}>
                  {boothStatusMeta[b.status].icon}
                </text>
                <text
                  x={centreX} y={b.y + b.h / 2 + Math.min(18, b.h / 3.2)}
                  textAnchor="middle" fontSize={11} fontWeight={700} fill="#0f172a"
                >
                  {b.label || boothStatusMeta[b.status].label}
                </text>
              </>
            ) : (
              <>
                {showNumbers && (
                  <text
                    x={b.x + 5} y={b.y + 14}
                    fontSize={12} fontWeight={800} fill="#1a3c5e"
                  >
                    {b.number || b.label}
                  </text>
                )}

                {name && placement === 'beside' && (
                  <line
                    x1={b.x + b.w} y1={b.y + b.h / 2}
                    x2={plan.width + 12} y2={b.y + b.h / 2}
                    stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3"
                  />
                )}

                {name && chipLines.length > 0 && (
                  <g>
                    <rect
                      x={chipX} y={chipY} width={chipW} height={chipH} rx={Math.max(4, chipFont * 0.22)}
                      fill="#ffffff" stroke="#1a3c5e" strokeWidth={Math.max(1.2, chipFont * 0.07)}
                    />
                    {chipLines.map((line, i) => (
                      <text
                        key={i}
                        x={placement === 'beside' ? chipX + 8 : centreX}
                        y={chipY + 4 + lineH * (i + 0.78)}
                        textAnchor={placement === 'beside' ? 'start' : 'middle'}
                        fontSize={chipFont}
                        fontWeight={700}
                        fill="#0f172a"
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                )}

                {!name && !showNumbers && (
                  <text x={centreX} y={b.y + b.h / 2 + 4} textAnchor="middle" fontSize={11} fill="#94a3b8">
                    {b.label}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
