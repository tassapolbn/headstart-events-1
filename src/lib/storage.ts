import { supabase } from './supabase';
import { uid } from './utils';

function cleanName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

/** Upload a public asset (poster, banner, logo, floor plan background). Returns a public URL. */
export async function uploadPublicAsset(file: File | Blob, prefix: string, name?: string): Promise<string> {
  const fileName = `${prefix}/${Date.now()}-${cleanName(name || (file instanceof File ? file.name : 'asset.png'))}`;
  const { error } = await supabase.storage.from('event-assets').upload(fileName, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('event-assets').getPublicUrl(fileName);
  return data.publicUrl;
}

export interface StoredFileRef {
  bucket: string;
  path: string;
  name: string;
  size: number;
  type: string;
}

/** Upload a private vendor document / photo / signature. Returns a storage reference. */
export async function uploadVendorFile(file: File | Blob, eventId: string, name?: string): Promise<StoredFileRef> {
  const original = name || (file instanceof File ? file.name : 'upload.png');
  const path = `${eventId}/${uid()}-${cleanName(original)}`;
  const { error } = await supabase.storage.from('vendor-uploads').upload(path, file);
  if (error) throw error;
  return {
    bucket: 'vendor-uploads',
    path,
    name: original,
    size: file instanceof File ? file.size : (file as Blob).size,
    type: file instanceof File ? file.type : (file as Blob).type,
  };
}

/** Admins view private files through short lived signed URLs. */
export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('vendor-uploads').createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export function isStoredFileRef(value: unknown): value is StoredFileRef {
  return Boolean(
    value && typeof value === 'object' && 'bucket' in value && 'path' in value && 'name' in value
  );
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
