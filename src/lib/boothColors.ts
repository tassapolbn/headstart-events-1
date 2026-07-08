import type { BoothStatus } from './types';

export const boothStatusMeta: Record<BoothStatus, { label: string; color: string; selectable: boolean }> = {
  available:      { label: 'Available',       color: '#22c55e', selectable: true },
  reserved:       { label: 'Reserved',        color: '#f59e0b', selectable: false },
  booked:         { label: 'Booked',          color: '#ef4444', selectable: false },
  disabled:       { label: 'Disabled',        color: '#94a3b8', selectable: false },
  sponsor:        { label: 'Sponsor',         color: '#F0B323', selectable: false },
  vip:            { label: 'VIP',             color: '#8b5cf6', selectable: false },
  food_zone:      { label: 'Food Zone',       color: '#fb923c', selectable: false },
  activity_zone:  { label: 'Activity Zone',   color: '#14b8a6', selectable: false },
  stage:          { label: 'Stage',           color: '#1a3c5e', selectable: false },
  info_desk:      { label: 'Information Desk',color: '#06b6d4', selectable: false },
  toilet:         { label: 'Toilet',          color: '#64748b', selectable: false },
  emergency_exit: { label: 'Emergency Exit',  color: '#dc2626', selectable: false },
};

export const boothStatusList = Object.keys(boothStatusMeta) as BoothStatus[];

export function boothFill(status: BoothStatus, override?: string | null): string {
  return override || boothStatusMeta[status].color;
}
