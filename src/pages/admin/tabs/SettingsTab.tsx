import { Card } from '@/components/ui/basics';
import { Field, Input, Switch } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import type { TabProps } from '../EventEditorPage';

export default function SettingsTab({ draft, update }: TabProps) {
  const s = draft.settings;
  const set = (patch: Partial<typeof s>) => update({ settings: { ...s, ...patch } });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Registration behaviour">
        <div className="space-y-5">
          <Switch
            checked={s.requireApproval}
            onChange={(requireApproval) => set({ requireApproval })}
            label="Require approval"
            description="New registrations arrive as Pending until you approve them."
          />
          <Switch
            checked={s.waitlistEnabled}
            onChange={(waitlistEnabled) => set({ waitlistEnabled })}
            label="Enable waitlist when full"
            description="Once maximum registrations is reached, new submissions join the waitlist instead of being rejected."
          />
          <Switch
            checked={s.allowDuplicateEmail}
            onChange={(allowDuplicateEmail) => set({ allowDuplicateEmail })}
            label="Allow the same email to register twice"
            description="Usually off, which blocks duplicate submissions from the same address."
          />
          <RichTextArea
            id="conf-msg"
            label="Thank you message"
            rows={4}
            value={s.confirmationMessage}
            onChange={(confirmationMessage) => set({ confirmationMessage })}
            hint="Shown on the confirmation page after a successful registration. Supports bold, lists and links."
          />
          <Switch
            checked={s.showQrOnSuccess}
            onChange={(showQrOnSuccess) => set({ showQrOnSuccess })}
            label="Include QR Code after Registration"
            description="Show the attendee's check in QR code on the confirmation page. Turn off for simple events without check in."
          />
        </div>
      </Card>

      <Card title="Spam and bot protection">
        <div className="space-y-5">
          <p className="text-sm text-slate-600">
            Every form includes an invisible honeypot field and a minimum completion time. Bots fail both checks and their submissions are rejected by the database.
          </p>
          <Field label="Minimum seconds before submit" htmlFor="min-sec" hint="A human needs at least a few seconds to fill in a form. Default 3.">
            <Input
              id="min-sec" type="number" min={0} max={60} className="w-32"
              value={s.minSubmitSeconds}
              onChange={(e) => set({ minSubmitSeconds: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Booth picker label" htmlFor="booth-label" hint="Heading shown above the floor plan on the public form.">
            <Input id="booth-label" value={s.boothSelectionLabel} onChange={(e) => set({ boothSelectionLabel: e.target.value })} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
