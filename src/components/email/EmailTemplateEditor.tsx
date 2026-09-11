import { useMemo, useRef } from 'react';
import type { EmailTemplate, EventRecord } from '@/lib/types';
import { MERGE_FIELDS, buildMergeMap, renderMergeFields } from '@/lib/merge';
import { buildEmailHtml } from '@/lib/emailHtml';
import { useAppSettings } from '@/hooks/useAppSettings';
import { invalidNotificationEmails, notificationEmailEntries } from '@/lib/notificationEmails';
import { Card } from '@/components/ui/basics';
import { Field, Input, Switch, Textarea } from '@/components/ui/inputs';

export function EmailTemplateEditor({ event, template, onChange }: {
  event: EventRecord;
  template: EmailTemplate;
  onChange: (t: EmailTemplate) => void;
}) {
  const appSettings = useAppSettings();
  const recipients = notificationEmailEntries(template);
  const invalidEmails = invalidNotificationEmails(recipients);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<EmailTemplate>) => onChange({ ...template, ...patch });

  function insertMergeField(token: string) {
    const el = bodyRef.current;
    if (!el) {
      set({ body: template.body + token });
      return;
    }
    const start = el.selectionStart ?? template.body.length;
    const end = el.selectionEnd ?? template.body.length;
    const next = template.body.slice(0, start) + token + template.body.slice(end);
    set({ body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const sampleMap = useMemo(
    () => buildMergeMap(event, { name: 'Somchai Jaidee', reference: 'HS-4F7A2C', boothLabel: 'Booth A (No. 12)' }),
    [event]
  );

  const previewHtml = useMemo(
    () =>
      buildEmailHtml({
        template,
        mergeMap: sampleMap,
        logoUrl: appSettings?.email_logo_url ?? event.branding.logo_url ?? appSettings?.logo_url ?? `${window.location.origin}/logo.svg`,
        bannerUrl: event.branding.banner_url,
        qrUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=HS-4F7A2C',
        schoolName: appSettings?.school_name,
      }),
    [template, sampleMap, event, appSettings]
  );

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <Card title="Registration notifications for this form">
          <div className="space-y-4">
            <Switch
              checked={template.adminNotify}
              onChange={(adminNotify) => set({ adminNotify })}
              label="Notify this form's admins about new registrations"
              description="Only the addresses below receive this form's registration alerts and optional daily summary."
            />
            <Field
              label="Notification recipients"
              htmlFor="em-admin-emails"
              hint="Enter one email per line, or separate addresses with commas or semicolons. Leave empty to send no admin notifications. Save the event to apply changes."
              error={invalidEmails.length ? `Check these email addresses: ${invalidEmails.join(', ')}` : undefined}
            >
              <Textarea
                id="em-admin-emails"
                rows={4}
                value={recipients.join('\n')}
                onChange={(e) => set({ adminEmails: e.target.value.split(/[,;\n]/), adminEmail: undefined })}
                placeholder={'form.admin@headstartphuket.com\nbackup.admin@headstartphuket.com'}
                aria-invalid={invalidEmails.length > 0}
                spellCheck={false}
              />
            </Field>
            {!template.adminNotify && <p className="text-xs text-slate-500">Notifications are off. The recipient list will be kept for when you turn them on.</p>}
          </div>
        </Card>

        <Card title="Confirmation email">
          <div className="space-y-4">
            <Switch
              checked={template.enabled}
              onChange={(enabled) => set({ enabled })}
              label="Send a confirmation email after each registration"
              description="Requires the email relay URL to be set in Settings."
            />
            <Field label="Subject" htmlFor="em-subject">
              <Input id="em-subject" value={template.subject} onChange={(e) => set({ subject: e.target.value })} />
            </Field>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium text-slate-700">Body (HTML allowed)</span>
                {MERGE_FIELDS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => insertMergeField(m)}
                    className="rounded-full bg-navy-50 px-2.5 py-0.5 font-mono text-[11px] text-navy-700 hover:bg-navy-100"
                    title={`Insert ${m}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <Textarea
                ref={bodyRef}
                rows={12}
                value={template.body}
                onChange={(e) => set({ body: e.target.value })}
                className="font-mono text-xs"
                aria-label="Email body"
              />
              <p className="mt-1 text-xs text-slate-500">Click a merge field chip to insert it at the cursor.</p>
            </div>
          </div>
        </Card>

        <Card title="Extras">
          <div className="space-y-4">
            <Switch
              checked={template.showLogo} onChange={(showLogo) => set({ showLogo })}
              label="Show the school logo in the header"
              description="Uses the white email logo from Settings, made for the dark blue header. The school name text is hidden when the logo is shown."
            />
            <Switch checked={template.showBanner} onChange={(showBanner) => set({ showBanner })} label="Show the event banner image" />
            <Switch checked={template.showQr} onChange={(showQr) => set({ showQr })} label="Include the check in QR code" />
            <Switch checked={template.attachCalendar} onChange={(attachCalendar) => set({ attachCalendar })} label="Attach a calendar invitation (.ics)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Action button label" hint="Optional">
                <Input value={template.buttonLabel ?? ''} onChange={(e) => set({ buttonLabel: e.target.value || undefined })} placeholder="View event details" />
              </Field>
              <Field label="Action button link">
                <Input value={template.buttonUrl ?? ''} onChange={(e) => set({ buttonUrl: e.target.value || undefined })} placeholder="https://…" />
              </Field>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Live preview" padded={false} className="h-fit">
        <div className="border-b border-slate-100 px-5 py-2.5 text-sm">
          <span className="text-slate-400">Subject: </span>
          <span className="font-medium text-slate-700">{renderMergeFields(template.subject, sampleMap)}</span>
        </div>
        <iframe
          title="Email preview"
          srcDoc={previewHtml}
          className="h-[620px] w-full rounded-b-2xl bg-slate-100"
          sandbox=""
        />
      </Card>
    </div>
  );
}
