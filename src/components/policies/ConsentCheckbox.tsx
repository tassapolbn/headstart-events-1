import type { EventRecord } from '@/lib/types';
import { FormattedText } from '@/components/ui/FormattedText';

export function consentText(event: Pick<EventRecord, 'settings'>): string {
  return event.settings.policyAckText?.trim() || 'I agree to the terms above.';
}

export function needsConsent(event: Pick<EventRecord, 'settings' | 'policies'>): boolean {
  return event.settings.requirePolicyAck && (event.settings.policyDisplay === 'checkbox' || event.policies.some(p => p.enabled && !!(p.title || p.content || p.image_url)));
}

export function ConsentCheckbox({ event, checked, onChange, disabled }: {
  event: Pick<EventRecord, 'settings' | 'policies'>; checked: boolean;
  onChange: (value: boolean) => void; disabled?: boolean;
}) {
  if (!needsConsent(event)) return null;
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled}
      className="mt-0.5 h-4 w-4 shrink-0 rounded" style={{ accentColor: 'var(--ev-primary)' }} aria-required="true" />
    <FormattedText value={consentText(event)} />
  </label>;
}
