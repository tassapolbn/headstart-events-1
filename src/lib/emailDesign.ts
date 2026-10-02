import type { EmailDesign } from './types';
import { safeColor } from './richText';

export function emailDesign(raw: EmailDesign = {}) {
  const color = (key: keyof EmailDesign, fallback: string) => safeColor(raw[key], fallback);
  const bound = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  return {
    headerPosition: ['top', 'afterBanner', 'bottom', 'hidden'].includes(raw.headerPosition || '') ? raw.headerPosition! : 'top',
    headerAlign: ['left', 'center', 'right'].includes(raw.headerAlign || '') ? raw.headerAlign! : 'center',
    headerColor: color('headerColor', '#1a3c5e'), headerTextColor: color('headerTextColor', '#ffffff'),
    headerPadding: bound(raw.headerPadding, 20, 0, 64), logoHeight: bound(raw.logoHeight, 56, 24, 160),
    font: ['Arial', 'Sarabun', 'Inter', 'Poppins', 'Nunito', 'Merriweather', 'Quicksand', 'Playfair Display'].includes(raw.font || '') ? raw.font! : 'Arial',
    pageColor: color('pageColor', '#f1f5f9'), bodyColor: color('bodyColor', '#ffffff'), textColor: color('textColor', '#14202e'),
    buttonColor: color('buttonColor', '#F0B323'), buttonTextColor: color('buttonTextColor', '#1a3c5e'),
    footerColor: color('footerColor', '#f8fafc'), footerTextColor: color('footerTextColor', '#94a3b8'),
  };
}
