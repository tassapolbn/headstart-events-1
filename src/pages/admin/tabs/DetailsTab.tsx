import { Card } from '@/components/ui/basics';
import { Field, Input } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import { slugify } from '@/lib/utils';
import type { TabProps } from '../EventEditorPage';

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export default function DetailsTab({ draft, update }: TabProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Basic information">
        <div className="space-y-4">
          <Field label="Event name" htmlFor="ev-name" required>
            <Input id="ev-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
          </Field>
          <Field label="Custom URL" htmlFor="ev-slug" hint={`Public link: ${window.location.origin}/e/${draft.slug}`}>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">/e/</span>
              <Input
                id="ev-slug" value={draft.slug}
                onChange={(e) => update({ slug: slugify(e.target.value) || draft.slug })}
              />
            </div>
          </Field>
          <RichTextArea
            id="ev-desc"
            label="Description"
            rows={7}
            value={draft.description}
            onChange={(description) => update({ description })}
            hint="Shown at the top of the registration page. Supports bold, bullet points and different fonts."
          />
          <Field label="Location" htmlFor="ev-loc">
            <Input id="ev-loc" value={draft.location} onChange={(e) => update({ location: e.target.value })} placeholder="e.g. School Atrium" />
          </Field>
        </div>
      </Card>

      <div className="space-y-5">
        <Card title="Date and time">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Event date" htmlFor="ev-date">
              <Input id="ev-date" type="date" value={draft.event_date ?? ''} onChange={(e) => update({ event_date: e.target.value || null })} />
            </Field>
            <Field label="End date" htmlFor="ev-end-date" hint="Optional, for multi day events.">
              <Input id="ev-end-date" type="date" value={draft.end_date ?? ''} onChange={(e) => update({ end_date: e.target.value || null })} />
            </Field>
            <Field label="Start time" htmlFor="ev-start">
              <Input id="ev-start" type="time" value={draft.start_time ?? ''} onChange={(e) => update({ start_time: e.target.value || null })} />
            </Field>
            <Field label="End time" htmlFor="ev-end">
              <Input id="ev-end" type="time" value={draft.end_time ?? ''} onChange={(e) => update({ end_time: e.target.value || null })} />
            </Field>
          </div>
        </Card>

        <Card title="Registration window and capacity">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Registration opens" htmlFor="ev-open" hint="Leave empty to open immediately.">
              <Input id="ev-open" type="datetime-local" value={isoToLocalInput(draft.reg_opens_at)} onChange={(e) => update({ reg_opens_at: localInputToIso(e.target.value) })} />
            </Field>
            <Field label="Registration closes" htmlFor="ev-close" hint="Leave empty for no deadline.">
              <Input id="ev-close" type="datetime-local" value={isoToLocalInput(draft.reg_closes_at)} onChange={(e) => update({ reg_closes_at: localInputToIso(e.target.value) })} />
            </Field>
            <Field label="Maximum registrations" htmlFor="ev-max" hint="Leave empty for unlimited.">
              <Input
                id="ev-max" type="number" min={1}
                value={draft.max_registrations ?? ''}
                onChange={(e) => update({ max_registrations: e.target.value ? Number(e.target.value) : null })}
              />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
