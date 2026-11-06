/**
 * Turn whatever a check in QR code holds into a registration reference.
 *
 * The confirmation email's QR holds the bare reference ("HS-53CEAB"). The
 * confirmation page's QR holds a lookup link ("https://site/lookup?ref=HS-53CEAB")
 * so a phone camera opens the booking. The ref= value is read first, because
 * the site's own address can contain text that looks like a reference
 * (e.g. "hs-events"). References are "HS-" and six hex characters.
 */
// No lookbehind: older iPhone Safari cannot parse it.
const REFERENCE = /(?:^|[^A-Z0-9])(HS-[0-9A-F]{6})(?![0-9A-Z])/gi;

export function referenceFromScan(text: string): string {
  const raw = text.trim();
  if (!raw) return '';

  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : '';
  const fromParam = new URLSearchParams(query).get('ref')?.trim();
  if (fromParam) return fromParam.toUpperCase();

  // Several look-alikes: the reference is the last one, after any address.
  let last = '';
  REFERENCE.lastIndex = 0;
  for (let m = REFERENCE.exec(raw); m; m = REFERENCE.exec(raw)) last = m[1];
  if (last) return last.toUpperCase();

  return raw.toUpperCase();
}
