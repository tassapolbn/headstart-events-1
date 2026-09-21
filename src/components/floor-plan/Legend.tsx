import { boothStatusChoices, boothStatusMeta } from '@/lib/boothColors';
import type { BoothStatus } from '@/lib/types';

export function Legend({ statuses, compact }: { statuses?: BoothStatus[]; compact?: boolean }) {
  const list = statuses ?? boothStatusChoices;
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`} aria-label="Booth status legend">
      {list.map((s) => (
        <li key={s} className="flex items-center gap-1.5 text-slate-600">
          <span className="h-3 w-3 rounded" style={{ background: boothStatusMeta[s].color }} aria-hidden="true" />
          {boothStatusMeta[s].label}
        </li>
      ))}
    </ul>
  );
}
