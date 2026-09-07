import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { PoliciesEditor } from '@/components/policies/PoliciesEditor';
import { ackPolicies, activePolicies, sectionAckText } from '@/components/policies/policyAcks';
import { Card } from '@/components/ui/basics';
import { Field, Input, Switch } from '@/components/ui/inputs';
import type { TabProps } from '../EventEditorPage';

export default function PoliciesTab({ draft, update }: TabProps) {
  const shown = activePolicies(draft.policies);
  const perSection = ackPolicies(draft.policies);
  const needsOverall = draft.settings.requirePolicyAck && shown.length > 0;
  const total = perSection.length + (needsOverall ? 1 : 0);

  return (
    <div className="space-y-5">
      {/* How the flow works, so the setup is never a guess */}
      <div className="rounded-2xl border border-navy-100 bg-gradient-to-br from-navy-50 to-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-700 text-white shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold text-navy-800">Agreements the vendor must accept</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Each section below can carry its own tick box, so a vendor accepts the food rules, the safety rules and
              the parking rules separately rather than with one blanket tick. Every acceptance is stored with the
              registration and shown on the registration record.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
            <span className="font-display text-lg font-bold leading-none text-navy-800">{total}</span>
            <span className="text-xs text-slate-500">tick box{total === 1 ? '' : 'es'} to accept</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
            <span className="font-display text-lg font-bold leading-none text-navy-800">{shown.length}</span>
            <span className="text-xs text-slate-500">section{shown.length === 1 ? '' : 's'} shown</span>
          </span>
        </div>
      </div>

      <Card title="Final acknowledgment">
        <div className="space-y-4">
          <Switch
            checked={draft.settings.requirePolicyAck}
            onChange={(requirePolicyAck) => update({ settings: { ...draft.settings, requirePolicyAck } })}
            label="Ask for one final acknowledgment after the sections"
            description="Shown at the end of the policy panel. It only unlocks once every section agreement above is ticked."
          />
          {draft.settings.requirePolicyAck && (
            <Field label="Final checkbox text" htmlFor="ack-text">
              <Input
                id="ack-text"
                value={draft.settings.policyAckText}
                onChange={(e) => update({ settings: { ...draft.settings, policyAckText: e.target.value } })}
              />
            </Field>
          )}
        </div>
      </Card>

      <PoliciesEditor
        policies={draft.policies}
        onChange={(policies) => update({ policies })}
        prefix={draft.id}
      />

      {total > 0 && (
        <Card title="What the vendor will tick">
          <ol className="space-y-2">
            {perSection.map((p, i) => (
              <li key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-navy-50 text-[11px] font-bold tabular-nums text-navy-600">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {p.title || 'Untitled section'}
                  </span>
                  <span className="block text-sm text-slate-700">{sectionAckText(p)}</span>
                </span>
              </li>
            ))}
            {needsOverall && (
              <li className="flex items-start gap-3 rounded-xl border-2 border-gold-200 bg-gold-50/50 px-3.5 py-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-gold-700">Final acknowledgment</span>
                  <span className="block text-sm text-slate-700">{draft.settings.policyAckText}</span>
                </span>
              </li>
            )}
          </ol>
        </Card>
      )}
    </div>
  );
}
