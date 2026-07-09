import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FloorPlanDesigner } from '@/components/floor-plan/FloorPlanDesigner';
import { Card } from '@/components/ui/basics';
import { Field, Select, Switch } from '@/components/ui/inputs';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { cn } from '@/lib/utils';
import type { TabProps } from '../EventEditorPage';

export default function FloorPlanTab({ draft, update }: TabProps) {
  const [groups, setGroups] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('booths')
      .select('group_name')
      .eq('event_id', draft.id)
      .not('group_name', 'is', null)
      .then(({ data }) => {
        const names = [...new Set((data ?? []).map((r) => r.group_name as string).filter(Boolean))].sort();
        setGroups(names);
      });
  }, [draft.id]);

  const labelCandidates = draft.form_schema.filter(
    (f) => !isContentField(f) && ['short_text', 'dropdown', 'radio', 'multiple_choice'].includes(f.type)
  );
  const typeCandidates = draft.form_schema.filter(
    (f) => !isContentField(f) && ['dropdown', 'radio', 'multiple_choice'].includes(f.type) && (f.options?.length ?? 0) > 0
  );
  const typeField = draft.form_schema.find((f) => f.id === draft.floor_plan.vendorTypeField);
  const zoneMap = draft.floor_plan.zoneMap ?? {};

  function toggleZone(option: string, group: string) {
    const current = zoneMap[option] ?? [];
    const next = current.includes(group) ? current.filter((g) => g !== group) : [...current, group];
    update({ floor_plan: { ...draft.floor_plan, zoneMap: { ...zoneMap, [option]: next } } });
  }

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

      <Card
        title="Vendor type zones"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Limit where each vendor type can book. First give your booths a <strong>Group / Zone</strong> name in the designer below
            (e.g. "Outside Provider Zone" on 5 booths). Then pick the question that asks for the vendor type and tick the zones
            each answer is allowed to use. Answers with no zones ticked can book anywhere. The database enforces these rules.
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
            groups.length === 0 ? (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                No booth groups found yet. In the designer below, select a booth and fill in its <strong>Group / Zone</strong> field
                (e.g. "Outside Provider Zone"), press Save layout, then come back here.
              </p>
            ) : (
              <div className="space-y-3">
                {(typeField.options ?? []).map((opt) => {
                  const chosen = zoneMap[opt] ?? [];
                  return (
                    <div key={opt} className="rounded-xl border border-slate-200 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-700">{opt}</p>
                        <span className="text-xs text-slate-400">
                          {chosen.length === 0 ? 'Can book anywhere' : `Limited to: ${chosen.join(', ')}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {groups.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => toggleZone(opt, g)}
                            aria-pressed={chosen.includes(g)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium transition',
                              chosen.includes(g)
                                ? 'border-navy-600 bg-navy-700 text-white'
                                : 'border-slate-300 text-slate-500 hover:border-navy-300 hover:text-navy-600'
                            )}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
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
