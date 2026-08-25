import { useCampus } from '@/context/CampusContext';
import { cn } from '@/lib/utils';

/** Prominent HSC / HSN switch. The active campus is unmistakable. */
export function CampusSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'bar' }) {
  const { campuses, campusId, setCampusId, loading } = useCampus();
  if (loading || campuses.length <= 1) return null;

  return (
    <div
      className={cn(
        'rounded-2xl p-1',
        variant === 'sidebar' ? 'bg-white/10' : 'bg-slate-200/80'
      )}
      role="tablist"
      aria-label="Select campus"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${campuses.length}, minmax(0, 1fr))` }}>
        {campuses.map((c) => {
          const active = c.id === campusId;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              onClick={() => setCampusId(c.id)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition',
                active
                  ? 'text-white shadow'
                  : variant === 'sidebar'
                    ? 'text-navy-100/70 hover:text-white'
                    : 'text-slate-500 hover:text-slate-700'
              )}
              style={active ? { background: c.accent } : undefined}
              title={c.school_name}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: active ? '#ffffff' : c.accent }}
                aria-hidden="true"
              />
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A compact badge showing the current campus, for page headers. */
export function CampusBadge() {
  const { campus } = useCampus();
  if (!campus) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
      style={{ background: campus.accent }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden="true" />
      {campus.name}
    </span>
  );
}
