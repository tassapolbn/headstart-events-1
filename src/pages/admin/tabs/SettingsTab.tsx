import { MessageSquareText, Ticket } from 'lucide-react';
import { Card } from '@/components/ui/basics';
import { Field, Input, Switch } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import {
  defaultEmailFor, defaultEmailTemplate, registrationSettingsPatch, surveyEmailTemplate, surveySettingsPatch,
} from '@/lib/defaults';
import { copyForType, formCopy } from '@/lib/formCopy';
import type { FormType } from '@/lib/types';
import { googleSheetId } from '@/lib/googleSheets';
import type { TabProps } from '../EventEditorPage';

export default function SettingsTab({ draft, update }: TabProps) {
  const s = draft.settings;
  const set = (patch: Partial<typeof s>) => update({ settings: { ...s, ...patch } });
  const copy = formCopy(draft);
  const isSurvey = copy.isSurvey;
  const sheetId = googleSheetId(s.googleSheetUrl);

  function switchType(next: FormType) {
    if (next === (isSurvey ? 'survey' : 'registration')) return;
    const patch = next === 'survey' ? surveySettingsPatch : registrationSettingsPatch;
    // Swap the email only while it is still the untouched default of the other type,
    // so a customised email is never overwritten.
    const otherDefault = next === 'survey' ? defaultEmailTemplate : surveyEmailTemplate;
    const untouched = draft.email_template.subject === otherDefault.subject && draft.email_template.body === otherDefault.body;
    update({
      settings: { ...s, ...patch },
      ...(untouched ? { email_template: { ...defaultEmailFor(next), adminEmails: draft.email_template.adminEmails, adminEmail: draft.email_template.adminEmail } } : {}),
      ...(next === 'survey' ? { floor_plan: { ...draft.floor_plan, enabled: false } } : {}),
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Form type" className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Form type">
          {([
            { id: 'registration', icon: Ticket, text: 'Sign ups with reference number, QR check in, booths, waitlist and a confirmation email.' },
            { id: 'survey', icon: MessageSquareText, text: 'Survey, questionnaire or feedback. Neutral wording (no "Register"), optional name and email, and a simple thank you email.' },
          ] as const).map((o) => {
            const active = (isSurvey ? 'survey' : 'registration') === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => switchType(o.id)}
                className={`rounded-xl border-2 p-4 text-left transition ${active ? 'border-navy-600 bg-navy-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                  <o.icon className="h-4 w-4" /> {copyForType(o.id).typeLabel}
                </span>
                <span className="mt-1 block text-xs text-slate-500">{o.text}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Form heading" htmlFor="form-heading" hint={`Optional. Default: "${copy.formHeading}"`}>
            <Input id="form-heading" value={s.formHeading ?? ''} placeholder={copy.formHeading} onChange={(e) => set({ formHeading: e.target.value || undefined })} />
          </Field>
          <Field label="Submit button label" htmlFor="submit-label" hint={`Optional. Default: "${copy.submitLabel}"`}>
            <Input id="submit-label" value={s.submitLabel ?? ''} placeholder={copy.submitLabel} onChange={(e) => set({ submitLabel: e.target.value || undefined })} />
          </Field>
        </div>
      </Card>

      <Card title={copy.behaviourCard}>
        <div className="space-y-5">
          {!isSurvey && (
            <>
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
            </>
          )}
          <Switch
            checked={isSurvey ? !s.allowDuplicateEmail : s.allowDuplicateEmail}
            onChange={(v) => set({ allowDuplicateEmail: isSurvey ? !v : v })}
            label={isSurvey ? 'Only one response per email address' : 'Allow the same email to register twice'}
            description={isSurvey
              ? 'Blocks a second response from the same email. Anonymous responses (no email) are always accepted.'
              : 'Usually off, which blocks duplicate submissions from the same address.'}
          />
          <RichTextArea
            id="conf-msg"
            label="Thank you message"
            rows={4}
            value={s.confirmationMessage}
            onChange={(confirmationMessage) => set({ confirmationMessage })}
            hint={isSurvey
              ? 'Shown on the thank you page after the form is submitted. Supports bold, lists and links.'
              : 'Shown on the confirmation page after a successful registration. Supports bold, lists and links.'}
          />
          {!isSurvey && (
            <Switch
              checked={s.showQrOnSuccess}
              onChange={(showQrOnSuccess) => set({ showQrOnSuccess })}
              label="Include QR Code after Registration"
              description="Show the attendee's check in QR code on the confirmation page. Turn off for simple events without check in."
            />
          )}
        </div>
      </Card>

      <Card title="Google Sheets">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Send this form’s submissions to its own Google spreadsheet. Use a different spreadsheet for each event.
          </p>
          <Field label="Google Sheet link" htmlFor="google-sheet-url"
            hint="Leave blank to disconnect. Save the event to apply changes."
            error={s.googleSheetUrl?.trim() && !sheetId ? 'Enter a link starting with https://docs.google.com/spreadsheets/d/' : undefined}>
            <Input id="google-sheet-url" type="url" value={s.googleSheetUrl ?? ''}
              placeholder="https://docs.google.com/spreadsheets/d/…/edit"
              aria-invalid={!!s.googleSheetUrl?.trim() && !sheetId}
              onChange={(e) => set({ googleSheetUrl: e.target.value })} />
          </Field>
          {sheetId && <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noreferrer"
            className="inline-block text-sm font-medium text-navy-700 underline">Open spreadsheet</a>}
          <p className="text-xs text-slate-500">
            One-time setup: enable Google Sheets syncing in the school’s Apps Script project and give its Google account
            Editor access to this spreadsheet. Keep sharing restricted to your team.
          </p>
          <p className="text-xs text-slate-500">
            Once set up, syncing checks every five minutes and also imports existing submissions. Large imports may take
            several runs. It creates a “Registrations” tab and retries missed rows automatically, even with emails off.
            Rows are copied once; later edits and cancellations are managed in the app.
          </p>
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
          {!isSurvey && (
            <Field label="Booth picker label" htmlFor="booth-label" hint="Heading shown above the floor plan on the public form.">
              <Input id="booth-label" value={s.boothSelectionLabel} onChange={(e) => set({ boothSelectionLabel: e.target.value })} />
            </Field>
          )}
        </div>
      </Card>
    </div>
  );
}
