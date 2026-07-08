import type { CSSProperties } from 'react';
import type { EventTheme } from './types';
import { defaultTheme } from './defaults';
import { ensureFont } from './fonts';

/** Convert an event theme into CSS variables scoped to the page wrapper. */
export function themeStyle(theme?: Partial<EventTheme>): CSSProperties {
  const t = { ...defaultTheme, ...(theme ?? {}) };
  ensureFont(t.font);
  ensureFont(t.headingFont);
  return {
    '--ev-primary': t.primary,
    '--ev-secondary': t.secondary,
    '--ev-accent': t.accent,
    '--ev-bg': t.backgroundTo ? `linear-gradient(170deg, ${t.background} 0%, ${t.backgroundTo} 100%)` : t.background,
    '--ev-card': t.card,
    '--ev-text': t.text,
    '--ev-radius': `${t.radius}px`,
    '--ev-font': `'${t.font}', system-ui, sans-serif`,
    '--ev-heading-font': `'${t.headingFont}', '${t.font}', sans-serif`,
  } as CSSProperties;
}

export function buttonClass(theme?: Partial<EventTheme>): string {
  const style = theme?.buttonStyle ?? 'solid';
  if (style === 'outline') return 'ev-btn-outline';
  if (style === 'pill') return 'ev-btn ev-btn-pill';
  return 'ev-btn';
}
