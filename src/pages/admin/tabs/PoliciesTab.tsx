import { PoliciesEditor } from '@/components/policies/PoliciesEditor';
import { Card } from '@/components/ui/basics';
import { Field, Select, Switch } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import type { TabProps } from '../EventEditorPage';

export default function PoliciesTab({ draft, update }: TabProps) {
  return (
    <div className="space-y-5">
      <Card title="Acknowledgment">
        <div className="space-y-4">
          <Field label="Policy display" htmlFor="policy-display">
            <Select id="policy-display" value={draft.settings.policyDisplay ?? 'sections'} onChange={e => update({ settings: { ...draft.settings, policyDisplay: e.target.value as 'sections' | 'checkbox', ...(e.target.value === 'checkbox' ? { requirePolicyAck: true } : {}) } })}>
              <option value="sections">Show policy sections above the form</option>
              <option value="checkbox">Only a consent checkbox at the end</option>
            </Select>
          </Field>
          <Switch
            checked={draft.settings.requirePolicyAck}
            onChange={(requirePolicyAck) => update({ settings: { ...draft.settings, requirePolicyAck } })}
            label="Require consent before submitting"
            description="The form cannot be submitted until the checkbox is ticked."
          />
          <RichTextArea label="Checkbox text" inline rows={3}
              id="ack-text"
              value={draft.settings.policyAckText}
              onChange={(policyAckText) => update({ settings: { ...draft.settings, policyAckText } })}
              hint="Shown just before Submit. Checkbox-only mode works without any policy sections."
          />
        </div>
      </Card>
      {draft.settings.policyDisplay !== 'checkbox' && <PoliciesEditor
        policies={draft.policies}
        onChange={(policies) => update({ policies })}
        prefix={draft.id}
      />}
    </div>
  );
}
