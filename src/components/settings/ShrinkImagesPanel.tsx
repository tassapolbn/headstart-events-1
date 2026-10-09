import { useState } from 'react';
import { ImageDown, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Card } from '@/components/ui/basics';
import {
  ORIGINALS, bigPictures, formatBytes, listAllFiles, shrinkStoredPictures,
  type AssetStore, type ShrinkOutcome, type StoredEntry, type StoredFile
} from '@/lib/assetShrink';

/** The public event-assets bucket, in the shape the shrink rules expect */
function eventAssets(): AssetStore {
  const bucket = supabase.storage.from('event-assets');
  return {
    list: async (prefix, options) => {
      const { data, error } = await bucket.list(prefix, { ...options, sortBy: { column: 'name', order: 'asc' } });
      return { data: data as unknown as StoredEntry[] | null, error };
    },
    download: path => bucket.download(path),
    copy: async (from, to) => ({ error: (await bucket.copy(from, to)).error }),
    upload: async (path, body, options) => ({ error: (await bucket.upload(path, body, options)).error })
  };
}

const fileName = (path: string) => path.split('/').pop()?.replace(/^\d{10,}-/, '') ?? path;

/**
 * Settings > Images: shrinks the pictures uploaded before uploads were made
 * smaller automatically. Each keeps its link, so nothing else changes.
 */
export function ShrinkImagesPanel() {
  const [step, setStep] = useState<'start' | 'checking' | 'found' | 'working' | 'done'>('start');
  const [pictures, setPictures] = useState<StoredFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [outcomes, setOutcomes] = useState<ShrinkOutcome[]>([]);
  const [error, setError] = useState('');

  const total = pictures.reduce((sum, picture) => sum + picture.size, 0);
  const shrunk = outcomes.filter(outcome => outcome.after !== null);
  const failed = outcomes.filter(outcome => outcome.error);
  const before = shrunk.reduce((sum, outcome) => sum + outcome.before, 0);
  const after = shrunk.reduce((sum, outcome) => sum + (outcome.after ?? 0), 0);

  async function check() {
    setStep('checking');
    setError('');
    try {
      setPictures(bigPictures(await listAllFiles(eventAssets())));
      setStep('found');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the stored pictures.');
      setStep('start');
    }
  }

  async function shrinkAll() {
    setStep('working');
    setProgress(0);
    setOutcomes(await shrinkStoredPictures(eventAssets(), pictures, { onProgress: done => setProgress(done) }));
    setStep('done');
  }

  return (
    <Card title="Make stored pictures smaller">
      <div className="space-y-4 text-sm leading-relaxed text-slate-600">
        <p>
          Every visitor downloads the banner, poster and background of the page they open, and confirmation emails show the banner too.
          Large pictures make that cost more data each time. New uploads are now made smaller automatically.
        </p>
        <p>
          Use this once for pictures uploaded before, on both campuses. Each picture keeps its link and looks the same, so pages, floor plans and emails
          that were already sent keep working. Only the file gets smaller. The original files are kept in the <code>{ORIGINALS}</code> folder.
        </p>

        {error && <p role="alert" className="text-red-600">{error}</p>}

        {(step === 'start' || step === 'checking') && (
          <Button icon={<Search className="h-4 w-4" />} loading={step === 'checking'} onClick={() => void check()}>
            Find large pictures
          </Button>
        )}

        {step === 'found' && (pictures.length === 0 ? (
          <p className="font-medium text-emerald-700">No large pictures found. Everything is already small.</p>
        ) : (
          <div className="space-y-3">
            <p className="font-medium text-slate-800">
              {pictures.length} large {pictures.length === 1 ? 'picture' : 'pictures'}, {formatBytes(total)} in total:
            </p>
            <ul className="max-h-56 space-y-1 overflow-auto rounded-xl border border-slate-200 p-3 text-xs">
              {pictures.map(picture => (
                <li key={picture.path} className="flex justify-between gap-3">
                  <span className="truncate">{fileName(picture.path)}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">{formatBytes(picture.size)}</span>
                </li>
              ))}
            </ul>
            <Button icon={<ImageDown className="h-4 w-4" />} onClick={() => void shrinkAll()}>
              Shrink {pictures.length} {pictures.length === 1 ? 'picture' : 'pictures'}
            </Button>
          </div>
        ))}

        {step === 'working' && (
          <div className="space-y-2" role="status">
            <p className="font-medium text-slate-800">Shrinking {Math.min(progress + 1, pictures.length)} of {pictures.length}… Keep this page open.</p>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-navy-700 transition-all" style={{ width: `${(progress / Math.max(1, pictures.length)) * 100}%` }} />
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-3" role="status">
            <p className="font-medium text-emerald-700">
              {shrunk.length > 0
                ? `Done. ${shrunk.length} ${shrunk.length === 1 ? 'picture went' : 'pictures went'} from ${formatBytes(before)} to ${formatBytes(after)}.`
                : 'Done. None of the pictures could be made much smaller.'}
            </p>
            {failed.length > 0 && (
              <p className="text-red-600">{failed.length} could not be changed and were left as they were: {failed.map(outcome => fileName(outcome.path)).join(', ')}.</p>
            )}
            <ul className="max-h-56 space-y-1 overflow-auto rounded-xl border border-slate-200 p-3 text-xs">
              {outcomes.map(outcome => (
                <li key={outcome.path} className="flex justify-between gap-3">
                  <span className="truncate">{fileName(outcome.path)}</span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {outcome.after !== null ? `${formatBytes(outcome.before)} → ${formatBytes(outcome.after)}` : outcome.error ? 'not changed' : 'kept as it was'}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="outline" onClick={() => void check()}>Check again</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
