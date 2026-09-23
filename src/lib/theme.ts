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

/** WCAG relative luminance. Returns null for anything that is not a plain hex colour. */
export function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = Number.parseInt(h, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). 0 if either colour is unreadable. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 0;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Large text needs 3:1 under WCAG AA. The event name is always large and bold. */
export const LARGE_TEXT_CONTRAST = 3;

/**
 * Event names are set in the school's gold, which sits on a pale page and can
 * drop to a contrast ratio near 1, meaning all but invisible. Rather than
 * overriding the colour the school chose, give the name an outline in the
 * direction that actually separates it from its background, the same way the
 * gold on their printed artwork is outlined. Returns 'none' when the colour
 * already reads on its own.
 */
/**
 * The outline colour picked when none is chosen in the Theme tab.
 *
 * The ring separates the letters from the page, so it is chosen against the
 * background rather than against the title: dark behind a pale page, white
 * behind a dark one. Also used to seed the colour picker, so "choose for me"
 * and the swatch shown always agree.
 */
export function autoTitleOutlineColor(theme?: Partial<EventTheme>): string {
  const t = { ...defaultTheme, ...(theme ?? {}) };
  const dark = t.text || '#14202e';
  const title = t.titleColor || t.primary;
  const scored = [t.background, t.backgroundTo]
    .filter((c): c is string => !!c)
    .map((stop) => ({ stop, ratio: contrastRatio(title, stop) }))
    .filter((s) => s.ratio > 0);
  if (scored.length === 0) return dark;
  const worst = scored.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return contrastRatio('#ffffff', worst.stop) > contrastRatio(dark, worst.stop) ? '#ffffff' : dark;
}

export function titleOutline(theme?: Partial<EventTheme>): string {
  const t = { ...defaultTheme, ...(theme ?? {}) };
  const mode = t.titleOutlineMode ?? 'auto';
  if (mode === 'never') return 'none';

  const title = t.titleColor || t.primary;
  const stops = [t.background, t.backgroundTo].filter((c): c is string => !!c);
  const scored = stops
    .map((stop) => ({ stop, ratio: contrastRatio(title, stop) }))
    .filter((s) => s.ratio > 0);
  // The stop the title reads worst against decides, so one weak end of a
  // gradient is enough to earn the outline.
  const worst = scored.length ? scored.reduce((a, b) => (b.ratio < a.ratio ? b : a)) : null;
  if (mode === 'auto' && (!worst || worst.ratio >= LARGE_TEXT_CONTRAST)) return 'none';

  // A colour chosen in the Theme tab wins, otherwise one is picked to suit.
  const ring = t.titleOutlineColor || autoTitleOutlineColor(theme);
  const rgb = rgbChannels(ring, '20, 32, 46');
  const edge = `rgba(${rgb}, 0.92)`;
  const glow = `rgba(${rgb}, 0.28)`;
  return [
    `-1px -1px 0 ${edge}`,
    `1px -1px 0 ${edge}`,
    `-1px 1px 0 ${edge}`,
    `1px 1px 0 ${edge}`,
    `0 2px 12px ${glow}`,
  ].join(', ');
}

/** Does the event name need the outline above? Decorative effects stand down when it does. */
export function titleNeedsOutline(theme?: Partial<EventTheme>): boolean {
  return titleOutline(theme) !== 'none';
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
    '--ev-title-shadow': titleOutline(theme),
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
