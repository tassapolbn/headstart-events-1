import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Booth, FloorPlanSettings } from '@/lib/types';
import { boothFill, boothStatusMeta, isMarkerStatus } from '@/lib/boothColors';
import { contrastText } from '@/lib/utils';
import { flagForText } from '@/lib/countries';
import { Legend } from './Legend';

/**
 * Public, real time booth selector with multi booth support.
 * Only available booths can be chosen. Changes stream in live, so a booth
 * booked by someone else turns red for every open visitor within a second.
 * Booked booths can display a label (e.g. country flag and name).
 */
export function BoothPicker({ eventId, plan, value, onChange, maxBooths = 1, vendorType, onSelectionLost, onLimitReached }: {
  eventId: string;
  plan: FloorPlanSettings;
  value: string[];
  onChange: (boothIds: string[], booths: Booth[]) => void;
  maxBooths?: number;
  /** The registrant's answer to the vendor type question, if the event uses one */
  vendorType?: string;
  onSelectionLost?: (booth: Booth) => void;
  onLimitReached?: () => void;
}) {
  const [booths, setBooths] = useState<Booth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('booths').select('*').eq('event_id', eventId).eq('hidden', false);
      if (!cancelled) {
        setBooths((data ?? []) as Booth[]);
        setLoading(false);
      }
    }
    void load();

    const channel = supabase
      .channel(`booths-${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booths', filter: `event_id=eq.${eventId}` },
        (payload) => {
          setBooths((all) => {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as { id?: string }).id;
              return all.filter((b) => b.id !== oldId);
            }
            const row = payload.new as Booth;
            if (row.hidden) return all.filter((b) => b.id !== row.id);
            const exists = all.some((b) => b.id === row.id);
            return exists ? all.map((b) => (b.id === row.id ? row : b)) : [...all, row];
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  // If a chosen booth stops being available (someone else was faster), drop it.
  useEffect(() => {
    if (value.length === 0) return;
    const lost = value
      .map((id) => booths.find((b) => b.id === id))
      .filter((b): b is Booth => !!b && b.status !== 'available');
    if (lost.length > 0) {
      const keep = value.filter((id) => !lost.some((b) => b.id === id));
      onChange(keep, booths.filter((b) => keep.includes(b.id)));
      lost.forEach((b) => onSelectionLost?.(b));
    }
  }, [booths, value]);

  function toggle(booth: Booth) {
    if (value.includes(booth.id)) {
      const next = value.filter((id) => id !== booth.id);
      onChange(next, booths.filter((b) => next.includes(b.id)));
      return;
    }
    if (value.length >= maxBooths) {
      if (maxBooths === 1) {
        onChange([booth.id], [booth]);
      } else {
        onLimitReached?.();
      }
      return;
    }
    const next = [...value, booth.id];
    onChange(next, booths.filter((b) => next.includes(b.id)));
  }

  function inAllowedZone(b: Booth): boolean {
    const types = b.allowed_types ?? [];
    if (types.length === 0) return true;
    return !!vendorType && types.includes(vendorType);
  }
  const hasRestrictions = booths.some((b) => (b.allowed_types?.length ?? 0) > 0);

  // Drop selections that stop being allowed when the vendor type changes.
  useEffect(() => {
    if (value.length === 0) return;
    const keep = value.filter((id) => {
      const b = booths.find((x) => x.id === id);
      return b && inAllowedZone(b);
    });
    if (keep.length !== value.length) {
      onChange(keep, booths.filter((b) => keep.includes(b.id)));
    }
  }, [vendorType, booths]);

  const selectedBooths = useMemo(
    () => value.map((id) => booths.find((b) => b.id === id)).filter((b): b is Booth => !!b),
    [booths, value]
  );
  const availableCount = booths.filter((b) => b.status === 'available' && inAllowedZone(b)).length;
  const zoneNotice = hasRestrictions
    ? (!vendorType
        ? 'Some booths are reserved for specific vendor types. Please answer the vendor type question in the form below first.'
        : `Booths available to "${vendorType}" are shown in green. Grey dashed booths are reserved for other vendor types.`)
    : undefined;

  if (loading) {
    return <div className="ev-card animate-pulse p-6 text-center text-sm opacity-60">Loading floor plan…</div>;
  }
  if (booths.length === 0) return null;

  return (
    <div className="space-y-3">
      {zoneNotice && (
        <p className="rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 text-sm font-medium">{zoneNotice}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold">
          <span
            className="ev-pulse inline-block h-2 w-2 rounded-full"
            style={{ background: availableCount > 0 ? '#22c55e' : '#ef4444' }}
            aria-hidden="true"
          />
          {availableCount} booth{availableCount === 1 ? '' : 's'} available{hasRestrictions && vendorType ? ' for you' : ''}
          {maxBooths > 1 && <span className="font-normal opacity-70"> (choose up to {maxBooths})</span>}
        </span>
        {selectedBooths.length > 0 && (
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--ev-secondary)', color: 'var(--ev-text)' }}>
            Selected: {selectedBooths.map((b) => `${b.label} ${b.number}`.trim()).join(' + ')}
          </span>
        )}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
        <svg
          viewBox={`0 0 ${plan.width} ${plan.height}`}
          className="block h-auto w-full min-w-[560px]"
          role="group"
          aria-label="Interactive floor plan, choose an available booth"
        >
          {plan.background_url && (
            <image href={plan.background_url} x="0" y="0" width={plan.width} height={plan.height} preserveAspectRatio="xMidYMid slice" opacity="0.9" />
          )}
          {booths.map((b) => {
            const zoneOk = inAllowedZone(b);
            const marker = isMarkerStatus(b.status);
            const selectable = boothStatusMeta[b.status].selectable && zoneOk;
            const outOfZone = boothStatusMeta[b.status].selectable && !zoneOk;
            const isSelected = value.includes(b.id);
            const fill = isSelected ? 'var(--ev-primary)' : boothFill(b.status, b.color);
            const text = isSelected ? '#ffffff' : contrastText(boothFill(b.status, b.color));
            const flag = b.status === 'booked' ? flagForText(b.booked_label) : '';
            const subLabel = b.status === 'booked' && b.booked_label ? b.booked_label : b.label;
            return (
              <g key={b.id}>
                <rect
                  x={b.x} y={b.y} width={b.w} height={b.h} rx={6}
                  fill={outOfZone ? '#cbd5e1' : fill} fillOpacity={selectable || isSelected ? 0.95 : marker ? 0.45 : 0.55}
                  stroke={isSelected ? 'var(--ev-secondary)' : 'rgba(0,0,0,0.25)'}
                  strokeWidth={isSelected ? 4 : 1}
                  strokeDasharray={outOfZone ? '5 4' : undefined}
                  className={selectable ? 'booth-shape selectable' : undefined}
                  style={{ cursor: selectable ? 'pointer' : marker ? 'default' : 'not-allowed' }}
                  role={selectable ? 'button' : undefined}
                  tabIndex={selectable ? 0 : -1}
                  aria-pressed={selectable ? isSelected : undefined}
                  aria-label={
                    selectable
                      ? `${isSelected ? 'Unselect' : 'Choose'} booth ${b.label} ${b.number}`
                      : outOfZone
                        ? `Booth ${b.label} ${b.number} is reserved for a different vendor type`
                        : `${b.label || boothStatusMeta[b.status].label}: ${boothStatusMeta[b.status].label}${b.booked_label ? `, ${b.booked_label}` : ''}`
                  }
                  onClick={() => { if (selectable) toggle(b); }}
                  onKeyDown={(e) => {
                    if (selectable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggle(b);
                    }
                  }}
                />
                {marker ? (
                  <>
                    <text
                      x={b.x + b.w / 2} y={b.y + b.h / 2 + (b.label ? -2 : 8)}
                      textAnchor="middle" fontSize={b.font_size ?? Math.min(30, b.h / 2.2)} pointerEvents="none"
                    >
                      {boothStatusMeta[b.status].icon}
                    </text>
                    {b.label && (
                      <text
                        x={b.x + b.w / 2} y={b.y + b.h / 2 + Math.min(20, b.h / 3.2)}
                        textAnchor="middle" fontSize={b.font_size ? Math.max(9, b.font_size * 0.55) : Math.min(12, b.h / 5)}
                        fontWeight={700} fill={text} pointerEvents="none"
                      >
                        {b.label}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    {flag && (
                      <text
                        x={b.x + b.w / 2} y={b.y + b.h / 2 - Math.min(10, b.h / 6)}
                        textAnchor="middle" fontSize={b.font_size ?? Math.min(26, b.h / 2.6)} pointerEvents="none"
                      >
                        {flag}
                      </text>
                    )}
                    <text
                      x={b.x + b.w / 2}
                      y={flag ? b.y + b.h / 2 + Math.min(10, b.h / 6) : b.y + b.h / 2 - (subLabel ? 4 : -4)}
                      textAnchor="middle"
                      fontSize={flag ? (b.font_size ? Math.max(9, b.font_size * 0.55) : Math.min(13, b.h / 5)) : (b.font_size ?? Math.min(22, b.h / 3))}
                      fontWeight={700}
                      fill={text} pointerEvents="none"
                    >
                      {flag ? (subLabel.length > 16 ? `${subLabel.slice(0, 15)}…` : subLabel) : b.number}
                    </text>
                    {!flag && subLabel && (
                      <text
                        x={b.x + b.w / 2} y={b.y + b.h / 2 + Math.min(16, b.h / 4)}
                        textAnchor="middle"
                        fontSize={b.font_size ? Math.max(9, b.font_size * 0.55) : Math.min(12, b.h / 5)}
                        fill={text} pointerEvents="none"
                      >
                        {subLabel.length > 18 ? `${subLabel.slice(0, 17)}…` : subLabel}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <Legend compact />
    </div>
  );
}
