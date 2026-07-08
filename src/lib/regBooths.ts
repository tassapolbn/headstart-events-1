import type { Registration } from './types';

/** Every booth a registration holds (multi booth aware, with legacy fallback). */
export function boothList(reg: Registration): Array<{ label: string; number: string }> {
  const fromJunction = (reg.registration_booths ?? [])
    .map((rb) => rb.booths)
    .filter((b): b is { label: string; number: string } => !!b);
  if (fromJunction.length > 0) {
    return [...fromJunction].sort((a, b) => (a.number || a.label).localeCompare(b.number || b.label));
  }
  return reg.booths ? [reg.booths] : [];
}

export function boothText(reg: Registration): string {
  return boothList(reg)
    .map((b) => `${b.label} ${b.number}`.trim())
    .join(' + ');
}

export function boothNumbersText(reg: Registration): string {
  const list = boothList(reg);
  return list.map((b) => b.number || b.label).join(', ');
}
