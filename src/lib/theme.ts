import type { CSSProperties } from 'react';
import type { EventTheme } from './types';
import { QUESTION_LAYOUT_DEFAULTS } from './types';
import { defaultTheme } from './defaults';
import { ensureFont } from './fonts';

/**
 * "#1a3c5e" -> "26, 60, 94".
 * Themed pages build soft tints with rgba(var(--ev-primary-rgb), 0.08), which
 * works in every browser and, unlike var(--ev-bg), is never a gradient.
 */
export function rgbChannels(hex: string, fallback = '26, 60, 94'): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = Number.parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** Convert an event theme into CSS variables scoped to the page wrapper. */
export function themeStyle(theme?: Partial<EventTheme>): CSSProperties {
  const t = { ...defaultTheme, ...(theme ?? {}) };
  const q = { ...QUESTION_LAYOUT_DEFAULTS, ...(theme ?? {}) };
  ensureFont(t.font);
  ensureFont(t.headingFont);
  if (q.questionFont) ensureFont(q.questionFont);
  return {
    '--ev-primary': t.primary,
    '--ev-primary-rgb': rgbChannels(t.primary),
    '--ev-secondary': t.secondary,
    '--ev-accent': t.accent,
    '--ev-title': t.titleColor || t.primary,
    '--ev-heading': t.headingColor || t.primary,
    '--ev-bg': t.backgroundTo ? `linear-gradient(170deg, ${t.background} 0%, ${t.backgroundTo} 100%)` : t.background,
    '--ev-card': t.card,
    '--ev-text': t.text,
    '--ev-radius': `${t.radius}px`,
    '--ev-font': `'${t.font}', system-ui, sans-serif`,
    '--ev-heading-font': `'${t.headingFont}', '${t.font}', sans-serif`,
    '--ev-q-gap': `${q.questionGap ?? QUESTION_LAYOUT_DEFAULTS.questionGap}px`,
    '--ev-q-size': `${q.questionSize ?? QUESTION_LAYOUT_DEFAULTS.questionSize}px`,
    '--ev-q-weight': `${q.questionWeight ?? QUESTION_LAYOUT_DEFAULTS.questionWeight}`,
    '--ev-q-font': q.questionFont ? `'${q.questionFont}', var(--ev-font)` : 'var(--ev-font)',
  } as CSSProperties;
}

export function buttonClass(theme?: Partial<EventTheme>): string {
  const style = theme?.buttonStyle ?? 'solid';
  if (style === 'outline') return 'ev-btn-outline';
  if (style === 'pill') return 'ev-btn ev-btn-pill';
  return 'ev-btn';
}

/** Does this theme put each question in its own box? */
export function usesQuestionCards(theme?: Partial<EventTheme>): boolean {
  return (theme?.questionLayout ?? QUESTION_LAYOUT_DEFAULTS.questionLayout) === 'card';
}
