import type { FloorPlanSettings } from '@/lib/types';

export function Legend({ entries, compact }: { entries?: FloorPlanSettings['legend']; compact?: boolean }) {
  const list = (entries ?? []).filter((entry) => entry.label.trim() && /^#[0-9a-f]{6}$/i.test(entry.color));
  if (!list.length) return null;
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-2 text-sm ${compact ? '' : 'py-2'}`} aria-label="Floor plan colour key">
      {list.map((entry) => (
        <li key={entry.id} className="flex min-w-0 items-center gap-2 text-slate-600">
          <span className="h-3.5 w-3.5 shrink-0 rounded border border-black/10" style={{ backgroundColor: entry.color }} aria-hidden="true" />
          <span className="break-words">{entry.label}</span>
        </li>
      ))}
    </ul>
  );
}
