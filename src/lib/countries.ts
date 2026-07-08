/** Country list for International Day style events, with emoji flags. */

export interface Country { name: string; code: string }

export const COUNTRIES: Country[] = [
  { name: 'Argentina', code: 'AR' }, { name: 'Australia', code: 'AU' }, { name: 'Austria', code: 'AT' },
  { name: 'Bangladesh', code: 'BD' }, { name: 'Belgium', code: 'BE' }, { name: 'Brazil', code: 'BR' },
  { name: 'Cambodia', code: 'KH' }, { name: 'Canada', code: 'CA' }, { name: 'Chile', code: 'CL' },
  { name: 'China', code: 'CN' }, { name: 'Colombia', code: 'CO' }, { name: 'Czech Republic', code: 'CZ' },
  { name: 'Denmark', code: 'DK' }, { name: 'Egypt', code: 'EG' }, { name: 'Estonia', code: 'EE' },
  { name: 'Finland', code: 'FI' }, { name: 'France', code: 'FR' }, { name: 'Germany', code: 'DE' },
  { name: 'Greece', code: 'GR' }, { name: 'Hong Kong', code: 'HK' }, { name: 'Hungary', code: 'HU' },
  { name: 'Iceland', code: 'IS' }, { name: 'India', code: 'IN' }, { name: 'Indonesia', code: 'ID' },
  { name: 'Iran', code: 'IR' }, { name: 'Ireland', code: 'IE' }, { name: 'Israel', code: 'IL' },
  { name: 'Italy', code: 'IT' }, { name: 'Japan', code: 'JP' }, { name: 'Kazakhstan', code: 'KZ' },
  { name: 'Kenya', code: 'KE' }, { name: 'Kuwait', code: 'KW' }, { name: 'Laos', code: 'LA' },
  { name: 'Latvia', code: 'LV' }, { name: 'Lebanon', code: 'LB' }, { name: 'Lithuania', code: 'LT' },
  { name: 'Malaysia', code: 'MY' }, { name: 'Maldives', code: 'MV' }, { name: 'Mexico', code: 'MX' },
  { name: 'Mongolia', code: 'MN' }, { name: 'Morocco', code: 'MA' }, { name: 'Myanmar', code: 'MM' },
  { name: 'Nepal', code: 'NP' }, { name: 'Netherlands', code: 'NL' }, { name: 'New Zealand', code: 'NZ' },
  { name: 'Nigeria', code: 'NG' }, { name: 'Norway', code: 'NO' }, { name: 'Pakistan', code: 'PK' },
  { name: 'Peru', code: 'PE' }, { name: 'Philippines', code: 'PH' }, { name: 'Poland', code: 'PL' },
  { name: 'Portugal', code: 'PT' }, { name: 'Qatar', code: 'QA' }, { name: 'Romania', code: 'RO' },
  { name: 'Russia', code: 'RU' }, { name: 'Saudi Arabia', code: 'SA' }, { name: 'Scotland', code: 'GB' },
  { name: 'Singapore', code: 'SG' }, { name: 'Slovakia', code: 'SK' }, { name: 'South Africa', code: 'ZA' },
  { name: 'South Korea', code: 'KR' }, { name: 'Spain', code: 'ES' }, { name: 'Sri Lanka', code: 'LK' },
  { name: 'Sweden', code: 'SE' }, { name: 'Switzerland', code: 'CH' }, { name: 'Taiwan', code: 'TW' },
  { name: 'Thailand', code: 'TH' }, { name: 'Turkey', code: 'TR' }, { name: 'Ukraine', code: 'UA' },
  { name: 'United Arab Emirates', code: 'AE' }, { name: 'United Kingdom', code: 'GB' },
  { name: 'United States', code: 'US' }, { name: 'Uzbekistan', code: 'UZ' }, { name: 'Vietnam', code: 'VN' },
  { name: 'Wales', code: 'GB' },
];

/** ISO country code to emoji flag, e.g. TH -> Thai flag. */
export function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const aliases: Record<string, string> = {
  usa: 'US', america: 'US', uk: 'GB', england: 'GB', britain: 'GB',
  korea: 'KR', uae: 'AE', holland: 'NL',
};

/** Find a flag for free text like "Thailand" or "thailand ". Returns '' when unknown. */
export function flagForText(text: string | null | undefined): string {
  if (!text) return '';
  const t = text.trim().toLowerCase();
  if (aliases[t]) return flagEmoji(aliases[t]);
  const hit = COUNTRIES.find((c) => c.name.toLowerCase() === t)
    ?? COUNTRIES.find((c) => t.includes(c.name.toLowerCase()));
  return hit ? flagEmoji(hit.code) : '';
}
