import type { Booth, FloorPlanSettings } from '@/lib/types';
import { uid } from '@/lib/utils';

export const orientationPresets = {
  landscape: { width: 1600, height: 1000 },
  portrait: { width: 1000, height: 1400 },
};

export function snap(value: number, plan: FloorPlanSettings): number {
  if (!plan.showGrid || plan.gridSize <= 1) return Math.round(value);
  return Math.round(value / plan.gridSize) * plan.gridSize;
}

/** Convert a pointer event into floor plan coordinates. */
export function pointerToPlan(
  e: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  plan: FloorPlanSettings
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * plan.width,
    y: ((e.clientY - rect.top) / rect.height) * plan.height,
  };
}

export function makeBooth(eventId: string, x: number, y: number, w = 120, h = 80, count = 0): Booth {
  return {
    id: uid(),
    event_id: eventId,
    label: `Booth ${count + 1}`,
    number: String(count + 1),
    x, y, w, h,
    rotation: 0,
    color: null,
    status: 'available',
    hidden: false,
    group_name: null,
    notes: null,
    booked_label: null,
    font_size: null,
  };
}

export interface PlanExport {
  plan: FloorPlanSettings;
  booths: Array<Omit<Booth, 'id' | 'event_id'>>;
}

export function exportLayout(plan: FloorPlanSettings, booths: Booth[]): PlanExport {
  return {
    plan,
    booths: booths.map(({ id: _i, event_id: _e, ...rest }) => rest),
  };
}
