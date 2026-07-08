import * as XLSX from 'xlsx';
import type { EventRecord, Registration } from '@/lib/types';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { isStoredFileRef } from '@/lib/storage';
import { download } from '@/lib/utils';
import { boothText } from '@/lib/regBooths';

function cellValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (isStoredFileRef(v)) return v.name;
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length > 0 && entries.every(([, n]) => typeof n === 'number')) {
      return entries.map(([k, n]) => `${k} x${n}`).join(', ');
    }
    return JSON.stringify(v);
  }
  return String(v);
}

export function buildRows(event: EventRecord, regs: Registration[]): string[][] {
  const questionFields = event.form_schema.filter((f) => !isContentField(f));
  const header = [
    'Reference', 'Status', 'Name', 'Email', 'Phone', 'Booth', 'Checked in', 'Submitted',
    ...questionFields.map((f) => f.label),
  ];
  const rows = regs.map((r) => [
    r.reference,
    r.status,
    r.name ?? '',
    r.email ?? '',
    r.phone ?? '',
    boothText(r),
    r.checked_in_at ? new Date(r.checked_in_at).toLocaleString() : '',
    new Date(r.created_at).toLocaleString(),
    ...questionFields.map((f) => cellValue(r.data?.[f.id])),
  ]);
  return [header, ...rows];
}

export function exportCsv(event: EventRecord, regs: Registration[]) {
  const rows = buildRows(event, regs);
  const csv = rows
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  // BOM so Excel opens Thai characters correctly
  download(`${event.slug}-registrations.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
}

export function exportXlsx(event: EventRecord, regs: Registration[]) {
  const rows = buildRows(event, regs);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(40, Math.max(12, ...rows.map((r) => String(r[i] ?? '').length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
  XLSX.writeFile(wb, `${event.slug}-registrations.xlsx`);
}
