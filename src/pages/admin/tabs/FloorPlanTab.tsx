import { FloorPlanDesigner } from '@/components/floor-plan/FloorPlanDesigner';
import { Card } from '@/components/ui/basics';
import { Field, Select, Switch } from '@/components/ui/inputs';
import { isContentField } from '@/components/form-renderer/fieldZod';
import type { TabProps } from '../EventEditorPage';

export default function FloorPlanTab({ draft, update }: TabProps) {
  const labelCandidates = draft.form_schema.filter(
    (f) => !isContentField(f) && ['short_text', 'dropdown', 'radio', 'multiple_choice'].includes(f.type)
  );

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
      <FloorPlanDesigner
        eventId={draft.id}
        plan={draft.floor_plan}
        onPlanChange={(floor_plan) => update({ floor_plan })}
      />
    </div>
  );
}
