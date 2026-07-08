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

const pageCss: Record<SignFormat, string> = {
  'a4-portrait': '@page { size: A4 portrait; margin: 0; }',
  'a4-landscape': '@page { size: A4 landscape; margin: 0; }',
  'a3-portrait': '@page { size: A3 portrait; margin: 0; }',
  'a3-landscape': '@page { size: A3 landscape; margin: 0; }',
};

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
      .select('*, booths(label, number), registration_booths(booth_id, booths(label, number))')
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
      <style>{pageCss[format]}</style>

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
              <Field label="Paper format">
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
            <div className="mx-auto aspect-[4/3] w-full max-w-md">
              <SignLayout reg={chosen[0]} title={signTitle(chosen[0])} eventName={event.name} logo={logo} sponsorLogo={sponsorLogo} showQr={showQr} preview />
            </div>
          )}
        </Card>
      </div>

      {/* Print output: one sign per page */}
      <div className="hidden print:block">
        {chosen.map((r) => (
          <div key={r.id} className="print-page flex h-screen w-full items-stretch">
            <SignLayout reg={r} title={signTitle(r)} eventName={event.name} logo={logo} sponsorLogo={sponsorLogo} showQr={showQr} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SignLayout({ reg, title, eventName, logo, sponsorLogo, showQr, preview }: {
  reg: Registration;
  title: string;
  eventName: string;
  logo: string;
  sponsorLogo?: string;
  showQr: boolean;
  preview?: boolean;
}) {
  const lookupUrl = `${window.location.origin}/lookup?ref=${reg.reference}`;
  return (
    <div className={`flex h-full w-full flex-col items-center justify-between border-[12px] border-[#1a3c5e] bg-white p-[4%] text-center ${preview ? 'rounded-xl border-8' : ''}`}>
      <div className="flex w-full items-center justify-between">
        <img src={logo} alt="School logo" className={preview ? 'h-12 w-12 object-contain' : 'h-24 w-24 object-contain'} />
        <p className={`font-display font-semibold text-[#1a3c5e] ${preview ? 'text-sm' : 'text-3xl'}`}>{eventName}</p>
        {sponsorLogo ? (
          <img src={sponsorLogo} alt="Sponsor logo" className={preview ? 'h-12 w-12 object-contain' : 'h-24 w-24 object-contain'} />
        ) : (
          <div className={preview ? 'h-12 w-12' : 'h-24 w-24'} />
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-[2%]">
        <p className={`font-display font-extrabold leading-tight text-[#1a3c5e] ${preview ? 'text-3xl' : 'text-8xl'}`}>{title}</p>
        {boothList(reg).length > 0 && (
          <p className={`inline-block rounded-full bg-[#F0B323] px-[6%] py-[1.5%] font-display font-bold text-[#1a3c5e] ${preview ? 'text-lg' : 'text-6xl'}`}>
            Booth {boothNumbersText(reg)}
          </p>
        )}
      </div>

      <div className="flex w-full items-end justify-between">
        <p className={`font-mono text-slate-400 ${preview ? 'text-[10px]' : 'text-xl'}`}>{reg.reference}</p>
        {showQr && <QRCodeSVG value={lookupUrl} size={preview ? 64 : 180} level="M" />}
      </div>
    </div>
  );
}
