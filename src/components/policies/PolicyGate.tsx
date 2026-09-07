import { ArrowUpRight, Check, ShieldAlert } from 'lucide-react';
import type { PolicySection } from '@/lib/types';
import { ackPolicies } from './policyAcks';
import { revealFinalAck, revealPolicy } from './PolicyConsent';

/**
 * Sits directly above the submit button. A disabled button with no explanation
 * is the classic dead end on long forms, so instead we name every outstanding
 * agreement and make each one a shortcut straight back to its section.
 */
export function PolicyGate({ policies, accepted, requireOverall, overallAccepted }: {
  policies: PolicySection[];
  accepted: Record<string, boolean>;
  requireOverall: boolean;
  overallAccepted: boolean;
}) {
  const ackList = ackPolicies(policies);
  const outstanding = ackList.filter((p) => !accepted[p.id]);
  const finalMissing = requireOverall && !overallAccepted;

  if (ackList.length === 0 && !requireOverall) return null;

  if (outstanding.length === 0 && !finalMissing) {
    return (
      <div className="ev-gate is-done" role="status">
        <span className="ev-gate-icon"><Check className="h-4 w-4" strokeWidth={3} /></span>
        <p className="text-sm font-semibold">
          All {ackList.length + (requireOverall ? 1 : 0)} agreement
          {ackList.length + (requireOverall ? 1 : 0) === 1 ? '' : 's'} accepted. You are ready to submit.
        </p>
      </div>
    );
  }

  return (
    <div className="ev-gate" role="status">
      <div className="flex items-center gap-2.5">
        <span className="ev-gate-icon"><ShieldAlert className="h-4 w-4" /></span>
        <p className="text-sm font-semibold">Before you can submit</p>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {outstanding.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => revealPolicy(p.id)} className="ev-gate-link">
              <span className="min-w-0 flex-1 truncate">Accept &ldquo;{p.title || 'Policy'}&rdquo;</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </li>
        ))}
        {finalMissing && (
          <li>
            <button type="button" onClick={revealFinalAck} className="ev-gate-link">
              <span className="min-w-0 flex-1 truncate">Tick the final acknowledgment</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
