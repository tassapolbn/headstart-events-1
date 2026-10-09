import { isShrinkable, shrinkPicture, type ShrunkType } from './imageShrink';

/**
 * Shrinks the pictures already stored in the public event-assets bucket.
 *
 * Each picture is replaced by a smaller copy under the same name, so every
 * event page, floor plan and confirmation email that shows it keeps working
 * and simply downloads less. The original is first copied (inside Supabase,
 * without downloading it) to the originals/ folder, in case it is ever needed.
 *
 * Storage is passed in, so these rules can be tested without Supabase.
 */

export const ORIGINALS = 'originals';
/** Marks a picture that was shrunk, or uploaded after shrinking was added */
const LONG_CACHE = '31536000';

type Failure = { message: string } | null;

/** The parts of a Supabase Storage bucket this needs */
export interface AssetStore {
  list(prefix: string, options: { limit: number; offset: number }): Promise<{ data: StoredEntry[] | null; error: Failure }>;
  download(path: string): Promise<{ data: Blob | null; error: Failure }>;
  copy(from: string, to: string): Promise<{ error: Failure }>;
  upload(path: string, body: Blob, options: { upsert: boolean; cacheControl: string }): Promise<{ error: Failure }>;
}

/** One row of a Storage listing. Folders have no id. */
export interface StoredEntry {
  name: string;
  id: string | null;
  metadata?: { size?: number; mimetype?: string; cacheControl?: string } | null;
}

export interface StoredFile {
  path: string;
  size: number;
  type: string;
  cacheControl: string;
}

export interface ShrinkOutcome {
  path: string;
  before: number;
  /** The new size, or null when the picture was left as it was */
  after: number | null;
  error?: string;
}

const PAGE = 1000;

/** Every file in the bucket, in every folder, except the kept originals */
export async function listAllFiles(store: AssetStore, prefix = ''): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await store.list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    const entries = data ?? [];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!prefix && entry.name === ORIGINALS) continue;
      if (entry.id === null) files.push(...(await listAllFiles(store, path)));
      else files.push({
        path,
        size: entry.metadata?.size ?? 0,
        type: entry.metadata?.mimetype ?? '',
        cacheControl: entry.metadata?.cacheControl ?? ''
      });
    }
    if (entries.length < PAGE) return files;
  }
}

/** The stored pictures worth shrinking, biggest first. Pictures already shrunk are left alone. */
export function bigPictures(files: StoredFile[]): StoredFile[] {
  return files
    .filter(file => isShrinkable(file.type, file.size) && !file.cacheControl.includes(LONG_CACHE))
    .sort((a, b) => b.size - a.size);
}

/** Replaces each picture with a smaller copy under the same name, keeping the original in originals/ */
export async function shrinkStoredPictures(
  store: AssetStore,
  pictures: StoredFile[],
  {
    shrink = shrinkPicture,
    onProgress
  }: {
    shrink?: (blob: Blob, type: string) => Promise<{ blob: Blob; type: ShrunkType } | null>;
    onProgress?: (done: number, total: number) => void;
  } = {}
): Promise<ShrinkOutcome[]> {
  const outcomes: ShrinkOutcome[] = [];
  for (const picture of pictures) {
    try {
      const { data, error } = await store.download(picture.path);
      if (error || !data) throw new Error(error?.message ?? 'Could not download the picture');
      const smaller = await shrink(data, picture.type || data.type);
      if (!smaller) {
        outcomes.push({ path: picture.path, before: picture.size, after: null });
      } else {
        const kept = await store.copy(picture.path, `${ORIGINALS}/${picture.path}`);
        // A copy from an earlier run is just as good
        if (kept.error && !/exist/i.test(kept.error.message)) throw new Error(kept.error.message);
        const saved = await store.upload(picture.path, smaller.blob, { upsert: true, cacheControl: LONG_CACHE });
        if (saved.error) throw new Error(saved.error.message);
        outcomes.push({ path: picture.path, before: picture.size, after: smaller.blob.size });
      }
    } catch (err) {
      outcomes.push({ path: picture.path, before: picture.size, after: null, error: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(outcomes.length, pictures.length);
  }
  return outcomes;
}

/** 1.4 MB, 820 KB */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
