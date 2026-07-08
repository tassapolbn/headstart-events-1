import { useMemo, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Eye, PackagePlus, Plus } from 'lucide-react';
import type { EventTheme, FieldType, FormField } from '@/lib/types';
import { countryDropdownPreset, fieldTypeMeta, vendorFormPreset } from '@/lib/defaults';
import { COUNTRIES } from '@/lib/countries';
import { uid } from '@/lib/utils';
import { Button, Card, EmptyState } from '@/components/ui/basics';
import { Modal } from '@/components/ui/overlays';
import { FormRenderer } from '@/components/form-renderer/FormRenderer';
import { themeStyle } from '@/lib/theme';
import { SortableFieldCard } from './FieldCard';
import { FieldSettings } from './FieldSettings';

const groups: Array<'Basic' | 'Selection' | 'Advanced'> = ['Basic', 'Selection', 'Advanced'];

function newField(type: FieldType): FormField {
  const meta = fieldTypeMeta[type];
  const base: FormField = { id: uid(), type, label: meta.label, required: false };
  if (['dropdown', 'radio', 'checkboxes', 'multiple_choice'].includes(type)) {
    base.options = ['Option 1', 'Option 2'];
  }
  if (type === 'heading') base.content = 'Section heading';
  if (type === 'rich_text') base.content = '<p>Write your text here.</p>';
  if (type === 'file' || type === 'photo') base.maxSizeMB = 10;
  return base;
}

export function FormBuilder({ fields, onChange, theme }: {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  theme: EventTheme;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(fields[0]?.id ?? null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selected = useMemo(() => fields.find((f) => f.id === selectedId) ?? null, [fields, selectedId]);

  function add(type: FieldType) {
    const f = newField(type);
    onChange([...fields, f]);
    setSelectedId(f.id);
  }
  function patch(id: string, p: Partial<FormField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...p } : f)));
  }
  function remove(id: string) {
    onChange(fields.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  function duplicate(id: string) {
    const i = fields.findIndex((f) => f.id === id);
    if (i < 0) return;
    const copy: FormField = { ...JSON.parse(JSON.stringify(fields[i])), id: uid(), label: `${fields[i].label} (copy)` };
    const next = [...fields];
    next.splice(i + 1, 0, copy);
    onChange(next);
    setSelectedId(copy.id);
  }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    onChange(arrayMove(fields, from, to));
  }
  function insertVendorPack() {
    onChange([...fields, ...vendorFormPreset()]);
  }
  function insertCountryQuestion() {
    const f = countryDropdownPreset(COUNTRIES.map((c) => c.name));
    onChange([...fields, f]);
    setSelectedId(f.id);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_1fr_320px]">
      {/* Palette */}
      <Card title="Add a question" className="h-fit">
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g} fields</p>
              <div className="flex flex-wrap gap-1.5 xl:flex-col xl:gap-1">
                {Object.entries(fieldTypeMeta)
                  .filter(([, m]) => m.group === g)
                  .map(([type, m]) => (
                    <button
                      key={type}
                      onClick={() => add(type as FieldType)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-xs font-medium text-slate-600 transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700"
                    >
                      <Plus className="h-3 w-3 shrink-0" /> {m.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" className="w-full" icon={<PackagePlus className="h-3.5 w-3.5" />} onClick={insertVendorPack}>
            Insert vendor questions
          </Button>
          <Button variant="outline" size="sm" className="w-full" icon={<PackagePlus className="h-3.5 w-3.5" />} onClick={insertCountryQuestion}>
            Insert country dropdown
          </Button>
        </div>
      </Card>

      {/* Canvas */}
      <Card
        title={`Your form (${fields.length} items)`}
        actions={<Button size="sm" variant="outline" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPreviewOpen(true)}>Preview</Button>}
      >
        {fields.length === 0 ? (
          <EmptyState
            title="Your form is empty"
            hint="Add questions from the palette, or insert the ready made vendor question pack."
            action={<Button icon={<PackagePlus className="h-4 w-4" />} onClick={insertVendorPack}>Insert vendor questions</Button>}
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {fields.map((f) => (
                  <SortableFieldCard
                    key={f.id}
                    field={f}
                    selected={f.id === selectedId}
                    onSelect={() => setSelectedId(f.id)}
                    onDuplicate={() => duplicate(f.id)}
                    onDelete={() => remove(f.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      {/* Settings */}
      <div className="h-fit xl:sticky xl:top-4">
        {selected ? (
          <FieldSettings
            key={selected.id}
            field={selected}
            allFields={fields}
            onChange={(p) => patch(selected.id, p)}
          />
        ) : (
          <Card title="Question settings">
            <p className="text-sm text-slate-500">Select a question on the left to edit its label, options, validation and logic.</p>
          </Card>
        )}
      </div>

      {/* Preview */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Form preview" wide>
        <div className="event-theme rounded-xl p-4" style={themeStyle(theme)}>
          <div className="ev-card mx-auto max-w-xl p-5">
            <FormRenderer fields={fields} onSubmit={() => {}} theme={theme} preview />
          </div>
        </div>
      </Modal>
    </div>
  );
}
