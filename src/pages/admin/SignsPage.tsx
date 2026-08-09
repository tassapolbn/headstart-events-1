import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Registration } from '@/lib/types';
import { useEvent } from '@/hooks/useEvent';
import { useAppSettings } from '@/hooks/useAppSettings';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { boothNumbersText, boothList } from '@/lib/regBooths';
import { Button, Card, EmptyState, PageLoader } from '@/components/ui/basics';
import { Field, Select, Switch } from '@/components/ui/inputs';
import { ImageUpload } from '@/components/ui/ImageUpload';

type SignFormat = 'a4-portrait' | 'a4-landscape' | 'a3-portrait' | 'a3-landscape';

/** True paper dimensions so one sign always fills exactly one sheet. */
const paperSize: Record<SignFormat, { w: number; h: number; css: string }> = {
  'a4-portrait': { w: 210, h: 297, css: 'A4 portrait' },
  'a4-landscape': { w: 297, h: 210, css: 'A4 landscape' },
  'a3-portrait': { w: 297, h: 420, css: 'A3 portrait' },
  'a3-landscape': { w: 420, h: 297, css: 'A3 landscape' },
};

/**
 * Print styles for the vendor signs.
 * Everything is expressed in millimetres and the sheet is clipped, so a long
 * vendor name can never push content onto a second page.
 */
function signPrintCss(format: SignFormat): string {
  const { w, h, css } = paperSize[format];
  return `
    @page { size: ${css}; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      .sign-sheet {
        width: ${w}mm;
        height: ${h}mm;
        box-sizing: border-box;
        overflow: hidden;
        display: flex;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .sign-sheet:last-child { page-break-after: auto; break-after: auto; }
    }
  `;
}

export default function SignsPage() {
  const { id } = useParams<{ id: string }>();
  const { event, loading: eventLoading } = useEvent(id);
  const appSettings = useAppSettings();
  const [regs, setRegs] = useState<Registration[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<SignFormat>('a4-landscape');
  const [titleField, setTitleField] = useState<string>('__name__');
  const [sponsorLogo, setSponsorLogo] = useState<string | undefined>();
  const [showQr, setShowQr] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('registrations')
      .select('*, booths!registrations_booth_id_fkey(label, number), registration_booths(booth_id, booths(label, number))')
      .eq('event_id', id)
      .in('status', ['confirmed', 'pending'])
      .order('created_at')
      .then(({ data }) => {
        const list = (data ?? []) as Registration[];
        setRegs(list);
        setSelected(new Set(list.map((r) => r.id)));
        setLoading(false);
      });
  }, [id]);

  const textFields = useMemo(
    () => (event?.form_schema ?? []).filter((f) => !isContentField(f) && ['short_text', 'paragraph'].includes(f.type)),
    [event]
  );

  function signTitle(r: Registration): string {
    if (titleField !== '__name__') {
      const v = r.data?.[titleField];
      if (v) return String(v);
    }
    return r.name ?? 'Vendor';
  }

  const chosen = regs.filter((r) => selected.has(r.id));
  const logo = event?.branding.logo_url ?? appSettings?.logo_url ?? '/logo.svg';

  if (eventLoading || loading || !event) return <PageLoader label="Loading vendor signs" />;

  return (
    <div className="space-y-5">
      <style>{signPrintCss(format)}</style>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Link to={`/admin/events/${id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200" aria-label="Back to event">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-navy-800">Vendor sign generator</h1>
          <p className="text-sm text-slate-500">{event.name}</p>
        </div>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={chosen.length === 0}>
          Print {chosen.length} sign{chosen.length === 1 ? '' : 's'}
        </Button>
      </div>

      <div className="no-print grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card title="Sign options">
            <div className="space-y-4">
              <Field label="Paper format" hint="One vendor per sheet. The sign fills the whole page exactly.">
                <Select value={format} onChange={(e) => setFormat(e.target.value as SignFormat)} aria-label="Paper format">
                  <option value="a4-portrait">A4 Portrait</option>
                  <option value="a4-landscape">A4 Landscape</option>
                  <option value="a3-portrait">A3 Portrait</option>
                  <option value="a3-landscape">A3 Landscape</option>
                </Select>
              </Field>
              <Field label="Sign title comes from" hint="Usually the stall or vendor name question.">
                <Select value={titleField} onChange={(e) => setTitleField(e.target.value)} aria-label="Sign title source">
                  <option value="__name__">Registrant name</option>
                  {textFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </Select>
              </Field>
              <Switch checked={showQr} onChange={setShowQr} label="Include QR code" description="Scans to the registration lookup for quick check in." />
              <ImageUpload
                label="Sponsor logo (optional)"
                value={sponsorLogo}
                onChange={setSponsorLogo}
                prefix={`${event.id}/signs`}
              />
            </div>
          </Card>

          <Card title={`Vendors (${selected.size} of ${regs.length} selected)`}>
            {regs.length === 0 ? (
              <EmptyState title="No confirmed registrations yet" />
            ) : (
              <>
                <div className="mb-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelected(new Set(regs.map((r) => r.id)))}>Select all</Button>
                  <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Clear</Button>
                </div>
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {regs.map((r) => (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(r.id); else next.delete(r.id);
                            setSelected(next);
                          }}
                          className="h-4 w-4 rounded accent-navy-700"
                        />
                        <span className="min-w-0 flex-1 truncate">{signTitle(r)}</span>
                        {boothList(r).length > 0 && <span className="text-xs text-slate-400">No. {boothNumbersText(r)}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <Card title="Preview (first sign)">
          {chosen.length === 0 ? (
            <EmptyState title="Select at least one vendor" />
          ) : (
            <div
              className="mx-auto w-full max-w-md"
              style={{ aspectRatio: `${paperSize[format].w} / ${paperSize[format].h}` }}
            >
              <SignLayout
                reg={chosen[0]} title={signTitle(chosen[0])} eventName={event.name}
                logo={logo} sponsorLogo={sponsorLogo} showQr={showQr}
                format={format} preview
              />
            </div>
          )}
        </Card>
      </div>

      {/* Print output: one sign per page */}
      <div className="hidden print:block">
        {chosen.map((r) => (
          <div key={r.id} className="sign-sheet">
            <SignLayout
              reg={r} title={signTitle(r)} eventName={event.name}
              logo={logo} sponsorLogo={sponsorLogo} showQr={showQr}
              format={format}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SignLayout({ reg, title, eventName, logo, sponsorLogo, showQr, preview, format = 'a4-landscape' }: {
  reg: Registration;
  title: string;
  eventName: string;
  logo: string;
  sponsorLogo?: string;
  showQr: boolean;
  preview?: boolean;
  format?: SignFormat;
}) {
  const lookupUrl = `${window.location.origin}/lookup?ref=${reg.reference}`;
  const { w, h } = paperSize[format];
  const short = Math.min(w, h);

  // Everything scales from the shorter paper edge, so an A3 sign is simply a
  // larger version of the A4 one and nothing ever overflows the sheet.
  const mm = (v: number) => `${(short * v) / 100}mm`;

  // Long names step down in size so they still fit on one line or two.
  const nameLen = title.trim().length;
  const nameScale = nameLen > 34 ? 0.44 : nameLen > 24 ? 0.55 : nameLen > 16 ? 0.7 : 1;

  if (preview) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-between rounded-xl border-8 border-[#1a3c5e] bg-white p-4 text-center">
        <div className="flex w-full items-center justify-between gap-2">
          <img src={logo} alt="School logo" className="h-10 w-auto max-w-[28%] object-contain" />
          <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-[#1a3c5e]">{eventName}</p>
          {sponsorLogo
            ? <img src={sponsorLogo} alt="Sponsor logo" className="h-10 w-auto max-w-[28%] object-contain" />
            : <span className="h-10 w-10" />}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2">
          <p className="font-display text-2xl font-extrabold leading-tight text-[#1a3c5e] line-clamp-3">{title}</p>
          {boothList(reg).length > 0 && (
            <p className="rounded-full bg-[#F0B323] px-4 py-1 font-display text-base font-bold text-[#1a3c5e]">
              Booth {boothNumbersText(reg)}
            </p>
          )}
        </div>
        <div className="flex w-full items-end justify-between">
          <p className="font-mono text-[10px] text-slate-400">{reg.reference}</p>
          {showQr && <QRCodeSVG value={lookupUrl} size={56} level="M" />}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        textAlign: 'center',
        background: '#ffffff',
        border: `${mm(2.4)} solid #1a3c5e`,
        padding: mm(5),
        overflow: 'hidden',
      }}
    >
      {/* Header: logos and event name */}
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: mm(3) }}>
        <img src={logo} alt="School logo" style={{ height: mm(11), width: 'auto', maxWidth: '26%', objectFit: 'contain' }} />
        <p
          style={{
            flex: 1, minWidth: 0, margin: 0,
            fontFamily: 'Poppins, Inter, sans-serif', fontWeight: 600, color: '#1a3c5e',
            fontSize: mm(4.4), lineHeight: 1.2,
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          }}
        >
          {eventName}
        </p>
        {sponsorLogo
          ? <img src={sponsorLogo} alt="Sponsor logo" style={{ height: mm(11), width: 'auto', maxWidth: '26%', objectFit: 'contain' }} />
          : <span style={{ height: mm(11), width: mm(11) }} />}
      </div>

      {/* Vendor name and booth */}
      <div
        style={{
          flex: 1, width: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: mm(4),
          overflow: 'hidden', padding: `0 ${mm(2)}`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'Poppins, Inter, sans-serif', fontWeight: 800, color: '#1a3c5e',
            fontSize: `calc(${mm(17)} * ${nameScale})`,
            lineHeight: 1.08,
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </p>
        {boothList(reg).length > 0 && (
          <p
            style={{
              margin: 0,
              background: '#F0B323', color: '#1a3c5e',
              borderRadius: '9999px',
              padding: `${mm(1.6)} ${mm(6)}`,
              fontFamily: 'Poppins, Inter, sans-serif', fontWeight: 700,
              fontSize: mm(8), lineHeight: 1.15,
              whiteSpace: 'nowrap',
            }}
          >
            Booth {boothNumbersText(reg)}
          </p>
        )}
      </div>

      {/* Footer: reference and QR */}
      <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'space-between', gap: mm(3) }}>
        <p style={{ margin: 0, fontFamily: 'monospace', color: '#94a3b8', fontSize: mm(3.2) }}>{reg.reference}</p>
        {showQr && <QRCodeSVG value={lookupUrl} size={Math.round(short * 0.55)} level="M" />}
      </div>
    </div>
  );
}
