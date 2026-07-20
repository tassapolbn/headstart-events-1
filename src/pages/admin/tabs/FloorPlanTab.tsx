import { FloorPlanDesigner } from '@/components/floor-plan/FloorPlanDesigner';
import { Card } from '@/components/ui/basics';
import { Field, Select, Switch } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';
import { isContentField } from '@/components/form-renderer/fieldZod';
import type { TabProps } from '../EventEditorPage';

export default function FloorPlanTab({ draft, update }: TabProps) {
  const labelCandidates = draft.form_schema.filter(
    (f) => !isContentField(f) && ['short_text', 'dropdown', 'radio', 'multiple_choice'].includes(f.type)
  );
  const typeCandidates = draft.form_schema.filter(
    (f) => !isContentField(f) && ['dropdown', 'radio', 'multiple_choice'].includes(f.type) && (f.options?.length ?? 0) > 0
  );
  const typeField = draft.form_schema.find((f) => f.id === draft.floor_plan.vendorTypeField);
  const vendorTypes = typeField?.options ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-5 lg:grid-cols-3">
          <Switch
            checked={draft.floor_plan.enabled}
            onChange={(enabled) => update({ floor_plan: { ...draft.floor_plan, enabled }, settings: { ...draft.settings, boothSelection: enabled ? 'single' : 'none' } })}
            label="Enable the interactive floor plan"
            description="Vendors pick available booths on the map while registering. Remember to press Save."
          />
          <Field
            label="Booths per registration"
            hint="Vendors with large stalls can take more than one booth."
          >
            <Select
              value={draft.settings.maxBooths}
              onChange={(e) => update({ settings: { ...draft.settings, maxBooths: Number(e.target.value) || 1 } })}
              aria-label="Booths per registration"
            >
              <option value={1}>1 booth</option>
              <option value={2}>Up to 2 booths</option>
              <option value={3}>Up to 3 booths</option>
            </Select>
          </Field>
          <Field
            label="Show this answer on booked booths"
            hint="e.g. a Country question for International Day. Country names automatically show their flag on the map."
          >
            <Select
              value={draft.floor_plan.bookedLabelField ?? ''}
              onChange={(e) => update({ floor_plan: { ...draft.floor_plan, bookedLabelField: e.target.value } })}
              aria-label="Booked booth label source"
            >
              <option value="">Nothing (default)</option>
              {labelCandidates.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title="Note for registrants">
        <RichTextArea
          label="Message shown above the floor plan"
          rows={4}
          value={draft.floor_plan.note ?? ''}
          onChange={(note) => update({ floor_plan: { ...draft.floor_plan, note } })}
          hint='Appears in the booth selection section on the registration page. Example: "Electrical points are available for booths 11 to 20 only." Supports bold, bullet points and links. Leave empty to hide.'
        />
      </Card>

      <Card title="Vendor type restrictions (e.g. Outside Provider)">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            How it works, in two steps: <strong>1)</strong> pick the question that asks for the vendor type.
            <strong> 2)</strong> in the designer below, click a booth (or drag to select several) and tick which
            vendor types may select it, e.g. mark 5 booths as "Outside Provider" only. Booths with no ticks stay
            open to everyone. Restricted booths show a gold dot and a dashed border in the designer, and the
            database enforces the rule on every submission.
          </p>
          <Field label="Vendor type question">
            <Select
              value={draft.floor_plan.vendorTypeField ?? ''}
              onChange={(e) => update({ floor_plan: { ...draft.floor_plan, vendorTypeField: e.target.value } })}
              aria-label="Vendor type question"
            >
              <option value="">No vendor types (everyone can book anywhere)</option>
              {typeCandidates.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </Select>
          </Field>
          {typeField && (
            <p className="rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-700">
              Types found: {vendorTypes.join(', ') || 'none'}. Now click booths below and use
              "Who can select this booth" to assign them. Remember to press Save layout.
            </p>
          )}
        </div>
      </Card>

      <FloorPlanDesigner
        eventId={draft.id}
        plan={draft.floor_plan}
        vendorTypes={draft.floor_plan.vendorTypeField ? vendorTypes : []}
        onPlanChange={(floor_plan) => update({ floor_plan })}
      />
    </div>
  );
}
