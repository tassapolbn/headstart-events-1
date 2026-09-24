import type { EventTheme } from './types';

export const PAGE_DESIGN_DEFAULTS = {
  pageWidth: 768, titleAlign: 'center' as const, bannerHeight: 0,
  bannerFit: 'cover' as const, bannerPosition: 50, posterWidth: 100,
  logoHeight: 64, backgroundOpacity: 15, showEventDetails: true,
};
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function pageDesign(theme?: Partial<EventTheme>) {
  return {
    pageWidth: bounded(theme?.pageWidth, 768, 560, 1120),
    titleAlign: theme?.titleAlign === 'left' ? 'left' as const : 'center' as const,
    bannerHeight: bounded(theme?.bannerHeight, 0, 0, 600),
    bannerFit: theme?.bannerFit === 'contain' ? 'contain' as const : 'cover' as const,
    bannerPosition: bounded(theme?.bannerPosition, 50, 0, 100),
    posterWidth: bounded(theme?.posterWidth, 100, 30, 100),
    logoHeight: bounded(theme?.logoHeight, 64, 32, 160),
    backgroundOpacity: bounded(theme?.backgroundOpacity, 15, 0, 60),
    showEventDetails: theme?.showEventDetails !== false,
  };
}
