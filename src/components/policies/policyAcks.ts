import type { PolicyAck, PolicySection } from '@/lib/types';
import { POLICY_ACK_KEY } from '@/lib/types';
import { defaultSectionAckText } from '@/lib/defaults';

/** Sections that are switched on and actually have something to show. */
export function activePolicies(policies: PolicySection[]): PolicySection[] {
  return policies.filter((p) => p.enabled && (p.title || p.content || p.image_url));
}

/** Sections that ask the registrant for their own separate tick. */
export function ackPolicies(policies: PolicySection[]): PolicySection[] {
  return activePolicies(policies).filter((p) => p.requireAck);
}

export function sectionAckText(p: PolicySection): string {
  return p.ackText?.trim() || defaultSectionAckText;
}

/**
 * Turn the ticked boxes into a durable record kept alongside the answers, so
 * the office can later prove exactly which agreements a vendor accepted.
 */
export function buildAckRecords(
  policies: PolicySection[],
  accepted: Record<string, boolean>,
  overall?: { accepted: boolean; text: string }
): PolicyAck[] {
  const at = new Date().toISOString();
  const records: PolicyAck[] = ackPolicies(policies)
    .filter((p) => accepted[p.id])
    .map((p) => ({ id: p.id, title: p.title || 'Policy', text: sectionAckText(p), accepted_at: at }));
  if (overall?.accepted) {
    records.push({ id: 'overall', title: 'Overall acknowledgment', text: overall.text, accepted_at: at });
  }
  return records;
}

/** Read the agreements back off a stored registration (tolerant of old rows). */
export function storedAcks(data: Record<string, unknown> | null | undefined): PolicyAck[] {
  const raw = data?.[POLICY_ACK_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is PolicyAck =>
      !!r && typeof r === 'object' && typeof (r as PolicyAck).title === 'string'
  );
}
