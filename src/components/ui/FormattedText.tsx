import { useEffect } from 'react';
import { richToHtml } from '@/lib/richText';
import { ensureContentFonts } from '@/lib/fonts';

export function FormattedText({ value, className = '' }: { value: string; className?: string }) {
  useEffect(() => ensureContentFonts(value), [value]);
  return <span className={`ev-formatted ${className}`} dangerouslySetInnerHTML={{ __html: richToHtml(value, true) }} />;
}
