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
    .map((b) => `${b.number} ${b.label}`.trim())
    .join(' + ');
}

export function boothNumbersText(reg: Registration): string {
  const list = boothList(reg);
  return list.map((b) => b.number || b.label).join(', ');
}

/** Export numbers separately so a single numeric booth sorts as a number. */
export function boothExportNumber(reg: Registration): string | number {
  const numbers = boothList(reg).map((b) => b.number).filter((n) => n !== '' && n != null);
  if (numbers.length === 1 && /^\d+$/.test(String(numbers[0]))) return Number(numbers[0]);
  return numbers.join(' + ');
}

export function boothVendorText(reg: Registration): string {
  return [...new Set(boothList(reg).map((b) => b.label).filter(Boolean))].join(' + ');
}
