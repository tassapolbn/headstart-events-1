/**
 * Makes pictures smaller before they are stored, and shrinks pictures that are
 * already stored.
 *
 * Every visitor downloads the banner, poster and background of the page they
 * open, and confirmation emails show the banner too, so a 2-6 MB picture is
 * paid for in Supabase data again and again. Scaled to at most 2560 px on its
 * longest side, a picture still looks sharp on a large screen but usually
 * comes to a few hundred KB.
 *
 * The result is JPEG, or PNG when the picture has see-through parts. Never
 * WebP, because some email programs (Outlook on Windows) cannot show it.
 */

/** Longest side, in pixels, after shrinking */
export const MAX_SIDE = 2560;
/** Pictures smaller than this are left as they are */
export const MIN_BYTES = 400 * 1024;
/** Keep the smaller copy only when it is at most this share of the original */
export const KEEP_RATIO = 0.8;
const JPEG_QUALITY = 0.86;

const SHRINKABLE = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', 'image/heif']);

export type ShrunkType = 'image/jpeg' | 'image/png';

/** Whether a file is a picture worth trying to shrink */
export function isShrinkable(type: string | undefined, size: number): boolean {
  return SHRINKABLE.has((type ?? '').toLowerCase()) && size >= MIN_BYTES;
}

/** The size to draw at: the longest side at most `maxSide`, never larger than the original */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The file name with the extension of its new format, e.g. Banner.PNG -> Banner.jpg */
export function renameForType(name: string, type: ShrunkType): string {
  const base = name.replace(/\.[^./\\]*$/, '') || 'image';
  return `${base}.${type === 'image/png' ? 'png' : 'jpg'}`;
}

/** Whether any pixel is see-through (RGBA data, as from getImageData) */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

function decode(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot open the picture'));
    };
    image.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: ShrunkType): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined));
}

/**
 * A smaller version of a picture, or null when it cannot be shrunk or would
 * not get much smaller. Never throws.
 */
export async function shrinkPicture(blob: Blob, type = blob.type): Promise<{ blob: Blob; type: ShrunkType } | null> {
  if (typeof document === 'undefined' || !isShrinkable(type, blob.size)) return null;
  try {
    // Browsers draw photos the right way up (EXIF orientation) when drawing an <img>
    const image = await decode(blob);
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const opaqueSource = /jpe?g/i.test(type);
    const transparent = !opaqueSource && hasTransparency(context.getImageData(0, 0, width, height).data);
    const outType: ShrunkType = transparent ? 'image/png' : 'image/jpeg';
    const out = await encode(canvas, outType);
    if (!out || out.type !== outType || out.size > blob.size * KEEP_RATIO) return null;
    return { blob: out, type: outType };
  } catch {
    return null;
  }
}
