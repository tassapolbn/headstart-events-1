import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { uploadPublicAsset } from '@/lib/storage';
import { useToast } from '@/context/ToastContext';
import { Button, Spinner } from './basics';

/** Upload an image to the public event-assets bucket and store its URL. */
export function ImageUpload({ label, value, onChange, prefix, hint }: {
  label: string; value?: string; onChange: (url: string | undefined) => void;
  prefix: string; hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Images must be 10 MB or smaller.', 'error');
      return;
    }
    setBusy(true);
    try {
      const url = await uploadPublicAsset(file, prefix);
      onChange(url);
      toast(`${label} uploaded.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {value ? (
        <div className="group relative overflow-hidden rounded-xl border border-slate-200">
          <img src={value} alt={label} className="h-32 w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-navy-900/50 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>Replace</Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onChange(undefined)}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition hover:border-navy-300 hover:text-navy-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300"
        >
          {busy ? <Spinner /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-xs font-medium">{busy ? 'Uploading' : 'Click to upload'}</span>
        </button>
      )}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden" aria-label={`Upload ${label}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
      />
    </div>
  );
}
