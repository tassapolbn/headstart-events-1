import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Mail, MessageCircle, Printer } from 'lucide-react';
import { publicEventUrl } from '@/lib/eventOps';
import { useToast } from '@/context/ToastContext';
import { Button, Card } from '@/components/ui/basics';
import { Input } from '@/components/ui/inputs';
import type { TabProps } from '../EventEditorPage';

export default function ShareTab({ draft }: TabProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const url = publicEventUrl(draft.slug);
  const shareText = `${draft.name} - register here: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Link copied. Ready to share with vendors and parents.');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast('Could not copy automatically. Please select the link and copy it manually.', 'error');
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Share this registration link">
        <div className="space-y-4">
          {draft.status === 'draft' && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              This event is still a draft. Set the status to Published or Open (top of this page) and save, otherwise visitors will see "Event not found".
            </p>
          )}
          <div className="flex gap-2">
            <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Public registration link" className="font-mono text-xs" />
            <Button onClick={() => void copy()} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#06C755] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Share on LINE
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(draft.name)}&body=${encodeURIComponent(shareText)}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy-700 px-3 py-2 text-xs font-semibold text-white hover:bg-navy-600"
            >
              <Mail className="h-3.5 w-3.5" /> Email
            </a>
          </div>
          <p className="text-xs text-slate-500">
            Vendors and parents only need this link. No account or login is required for them.
          </p>
        </div>
      </Card>

      <Card title="QR code for posters and notices">
        <div className="flex flex-col items-center gap-3 py-2 print-page">
          <QRCodeSVG value={url} size={190} level="M" includeMargin aria-label={`QR code linking to ${draft.name} registration`} />
          <p className="text-center text-sm font-semibold text-navy-800">{draft.name}</p>
          <p className="text-center font-mono text-xs text-slate-400">{url}</p>
          <Button variant="outline" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()} className="no-print">
            Print this QR
          </Button>
        </div>
      </Card>
    </div>
  );
}
