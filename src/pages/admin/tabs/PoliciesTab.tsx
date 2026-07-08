import { PoliciesEditor } from '@/components/policies/PoliciesEditor';
import { Card } from '@/components/ui/basics';
import { Field, Input, Switch } from '@/components/ui/inputs';
import type { TabProps } from '../EventEditorPage';

export default function PoliciesTab({ draft, update }: TabProps) {
  return (
    <div className="space-y-5">
      <Card title="Acknowledgment">
        <div className="space-y-4">
          <Switch
            checked={draft.settings.requirePolicyAck}
            onChange={(requirePolicyAck) => update({ settings: { ...draft.settings, requirePolicyAck } })}
            label="Require registrants to accept the policies"
            description="The form cannot be submitted until the checkbox is ticked."
          />
          <Field label="Checkbox text" htmlFor="ack-text">
            <Input
              id="ack-text"
              value={draft.settings.policyAckText}
              onChange={(e) => update({ settings: { ...draft.settings, policyAckText: e.target.value } })}
            />
          </Field>
        </div>
      </Card>
      <PoliciesEditor
        policies={draft.policies}
        onChange={(policies) => update({ policies })}
        prefix={draft.id}
      />
    </div>
  );
}
