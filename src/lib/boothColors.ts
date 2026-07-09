import type { BoothStatus } from './types';

export const boothStatusMeta: Record<BoothStatus, { label: string; color: string; selectable: boolean; icon?: string }> = {
  available:      { label: 'Available',       color: '#22c55e', selectable: true },
  reserved:       { label: 'Reserved',        color: '#f59e0b', selectable: false },
  booked:         { label: 'Booked',          color: '#ef4444', selectable: false },
  disabled:       { label: 'Disabled',        color: '#94a3b8', selectable: false },
  sponsor:        { label: 'Sponsor',         color: '#F0B323', selectable: false, icon: '⭐' },
  vip:            { label: 'VIP',             color: '#8b5cf6', selectable: false, icon: '👑' },
  food_zone:      { label: 'Food Zone',       color: '#fb923c', selectable: false, icon: '🍽️' },
  activity_zone:  { label: 'Activity Zone',   color: '#14b8a6', selectable: false, icon: '🎯' },
  stage:          { label: 'Stage',           color: '#1a3c5e', selectable: false, icon: '🎤' },
  info_desk:      { label: 'Information Desk',color: '#06b6d4', selectable: false, icon: 'ℹ️' },
  toilet:         { label: 'Toilet',          color: '#64748b', selectable: false, icon: '🚻' },
  emergency_exit: { label: 'Exit',            color: '#dc2626', selectable: false, icon: '🏃' },
  entrance:       { label: 'Entrance',        color: '#0ea5e9', selectable: false, icon: '🚪' },
};

/** Markers are areas like Stage or Entrance: icon plus name, no number, never clickable. */
export function isMarkerStatus(status: BoothStatus): boolean {
  return !!boothStatusMeta[status].icon;
}

export const boothStatusList = Object.keys(boothStatusMeta) as BoothStatus[];

/** The statuses offered in the designer and shown in legends. */
export const boothStatusChoices: BoothStatus[] = [
  'available', 'booked', 'reserved', 'stage', 'info_desk', 'toilet', 'emergency_exit', 'entrance',
];

export function boothFill(status: BoothStatus, override?: string | null): string {
  return override || boothStatusMeta[status].color;
}
