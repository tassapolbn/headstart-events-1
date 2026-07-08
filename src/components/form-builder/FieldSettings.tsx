import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { FieldCondition, FormField } from '@/lib/types';
import { fieldTypeMeta } from '@/lib/defaults';
import { isContentField } from '@/components/form-renderer/fieldZod';
import { Card } from '@/components/ui/basics';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';

const selectionTypes = ['dropdown', 'radio', 'checkboxes', 'multiple_choice'];
const textTypes = ['short_text', 'paragraph'];

export function FieldSettings({ field, allFields, onChange }: {
  field: FormField;
  allFields: FormField[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  const earlier = allFields.slice(0, allFields.findIndex((f) => f.id === field.id))
    .filter((f) => !isContentField(f));
  const isContent = isContentField(field);
  const cond: FieldCondition = field.condition ?? { fieldId: '', operator: 'equals', value: '' };

  function setCondition(patch: Partial<FieldCondition>) {
    const next = { ...cond, ...patch };
    onChange({ condition: next.fieldId ? next : undefined });
  }

  return (
    <Card title={`${fieldTypeMeta[field.type]?.label ?? 'Question'} settings`}>
      <div className="space-y-4">
        {!isContent && (
          <Field label="Question label" htmlFor="fs-label">
            <Input id="fs-label" value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
          </Field>
        )}

        {field.type === 'heading' && (
          <Field label="Heading text">
            <Textarea rows={2} value={field.content ?? ''} onChange={(e) => onChange({ content: e.target.value })} />
          </Field>
        )}
        {field.type === 'rich_text' && (
          <RichTextArea
            label="Content"
            value={field.content ?? ''}
            onChange={(content) => onChange({ content })}
          />
        )}

        {!isContent && (
          <>
            <Field label="Placeholder" htmlFor="fs-ph">
              <Input id="fs-ph" value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </Field>
            <Field label="Help text" htmlFor="fs-help">
              <Input id="fs-help" value={field.helpText ?? ''} onChange={(e) => onChange({ helpText: e.target.value })} />
            </Field>
            <Switch checked={!!field.required} onChange={(required) => onChange({ required })} label="Required" />
          </>
        )}

        {selectionTypes.includes(field.type) && (
          <>
            <OptionsEditor
              options={field.options ?? []}
              onChange={(options) => onChange({ options })}
            />
            {field.type === 'multiple_choice' && (
              <Switch checked={!!field.allowOther} onChange={(allowOther) => onChange({ allowOther })} label="Allow an 'Other' answer" />
            )}
          </>
        )}

        {field.type === 'number' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum">
              <Input
                type="number" value={field.validation?.min ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, min: e.target.value === '' ? undefined : Number(e.target.value) } })}
              />
            </Field>
            <Field label="Maximum">
              <Input
                type="number" value={field.validation?.max ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, max: e.target.value === '' ? undefined : Number(e.target.value) } })}
              />
            </Field>
          </div>
        )}

        {textTypes.includes(field.type) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min length">
              <Input
                type="number" value={field.validation?.minLength ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, minLength: e.target.value === '' ? undefined : Number(e.target.value) } })}
              />
            </Field>
            <Field label="Max length">
              <Input
                type="number" value={field.validation?.maxLength ?? ''}
                onChange={(e) => onChange({ validation: { ...field.validation, maxLength: e.target.value === '' ? undefined : Number(e.target.value) } })}
              />
            </Field>
          </div>
        )}

        {(field.type === 'file' || field.type === 'photo') && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Accepted types" hint="e.g. .pdf,.jpg">
              <Input value={field.accept ?? ''} onChange={(e) => onChange({ accept: e.target.value || undefined })} disabled={field.type === 'photo'} placeholder={field.type === 'photo' ? 'Images only' : ''} />
            </Field>
            <Field label="Max size (MB)">
              <Input
                type="number" min={1} max={10} value={field.maxSizeMB ?? 10}
                onChange={(e) => onChange({ maxSizeMB: Number(e.target.value) || 10 })}
              />
            </Field>
          </div>
        )}

        {['short_text', 'email', 'phone'].includes(field.type) && (
          <Field label="Use this answer as" hint="Copied into the registration record for search, emails and signs.">
            <Select value={field.mapTo ?? ''} onChange={(e) => onChange({ mapTo: (e.target.value || null) as FormField['mapTo'] })} aria-label="Map answer to">
              <option value="">Not mapped</option>
              <option value="name">Registrant name</option>
              <option value="email">Registrant email</option>
              <option value="phone">Registrant phone</option>
            </Select>
          </Field>
        )}

        {!isContent && earlier.length > 0 && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conditional logic</p>
            <Field label="Show this question only when">
              <Select value={cond.fieldId} onChange={(e) => setCondition({ fieldId: e.target.value })} aria-label="Condition question">
                <option value="">Always show</option>
                {earlier.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </Select>
            </Field>
            {cond.fieldId && (
              <>
                <Select value={cond.operator} onChange={(e) => setCondition({ operator: e.target.value as FieldCondition['operator'] })} aria-label="Condition operator">
                  <option value="equals">equals</option>
                  <option value="not_equals">does not equal</option>
                  <option value="contains">contains</option>
                  <option value="answered">is answered</option>
                </Select>
                {cond.operator !== 'answered' && (
                  <Input value={cond.value ?? ''} onChange={(e) => setCondition({ value: e.target.value })} placeholder="Value to compare" aria-label="Condition value" />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}


function OptionsEditor({ options, onChange }: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  function setAt(i: number, value: string) {
    onChange(options.map((o, idx) => (idx === i ? value : o)));
  }
  function removeAt(i: number) {
    onChange(options.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">Options</span>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-xs text-slate-400">Option {i + 1}:</span>
            <Input value={o} onChange={(e) => setAt(i, e.target.value)} aria-label={`Option ${i + 1}`} />
            <button type="button" aria-label={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" aria-label={`Move option ${i + 1} down`} disabled={i === options.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => removeAt(i)} className="rounded p-1 text-red-300 hover:text-red-500"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...options, ''])}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-navy-300 hover:text-navy-600"
      >
        <Plus className="h-3.5 w-3.5" /> Add option
      </button>
    </div>
  );
}
