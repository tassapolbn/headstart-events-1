import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { FieldCondition, FieldType, FormField } from '@/lib/types';
import { changeQuestionType } from '@/lib/questionTypes';
import { plainText } from '@/lib/richText';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { fieldTypeMeta } from '@/lib/defaults';
import { ordinal } from '@/lib/grid';
import { canAllowOther, isContentField } from '@/components/form-renderer/fieldZod';
import { Card } from '@/components/ui/basics';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/inputs';
import { RichTextArea } from '@/components/ui/RichTextArea';

const selectionTypes = ['evaluation', 'dropdown', 'radio', 'checkboxes', 'multiple_choice', 'menu_quantity', 'yes_no', 'picture_choice'];
/** Questions whose answers are fixed choices, so a rule can pick the answer from a list. */
const choiceAnswerTypes = ['evaluation', 'dropdown', 'radio', 'checkboxes', 'multiple_choice', 'yes_no', 'picture_choice', 'rating'];
const textTypes = ['short_text', 'paragraph'];

export function FieldSettings({ field, allFields, onChange, assetPrefix }: {
  assetPrefix: string;
  field: FormField;
  allFields: FormField[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  const earlier = allFields.slice(0, allFields.findIndex((f) => f.id === field.id))
    .filter((f) => !isContentField(f));
  const isContent = isContentField(field);
  const cond: FieldCondition = field.condition ?? { fieldId: '', operator: 'equals', value: '' };
  const source = earlier.find((f) => f.id === cond.fieldId);
  const sourceChoices = source && choiceAnswerTypes.includes(source.type) ? source.options ?? [] : [];

  function setCondition(patch: Partial<FieldCondition>) {
    const next = { ...cond, ...patch };
    onChange({ condition: next.fieldId ? next : undefined });
  }

  return (
    <Card title={`${fieldTypeMeta[field.type]?.label ?? 'Question'} settings`}>
      <div className="space-y-4">
        {!isContent && <Field label="Question type" htmlFor="fs-type" hint="Keeps this question and its saved answers. Check options and conditional rules after changing type.">
          <Select id="fs-type" value={field.type} onChange={e => onChange(changeQuestionType(field, e.target.value as FieldType))}>
            {Object.entries(fieldTypeMeta).filter(([type]) => !['heading', 'rich_text', 'callout', 'divider'].includes(type)).map(([type, meta]) => <option key={type} value={type}>{meta.label}</option>)}
          </Select>
        </Field>}
        {!isContent && (
          <RichTextArea inline rows={2} label="Question label" id="fs-label" value={field.labelHtml ?? field.label}
            onChange={labelHtml => onChange({ labelHtml, label: plainText(labelHtml) })} />
        )}

        {field.type === 'divider' && (
          <Field label="Divider text (optional)" hint="Small centered text, e.g. STALL DETAILS. Leave empty for a decorative line.">
            <Input value={field.content ?? ''} onChange={(e) => onChange({ content: e.target.value })} />
          </Field>
        )}
        {field.type === 'heading' && (
          <RichTextArea inline rows={2} label="Heading text" value={field.content ?? ''} onChange={content => onChange({ content })} />
        )}
        {(field.type === 'rich_text' || field.type === 'callout') && (
          <RichTextArea
            label={field.type === 'callout' ? 'Instructions' : 'Content'}
            value={field.content ?? ''}
            onChange={(content) => onChange({ content })}
          />
        )}
        {field.type === 'callout' && (
          <Field label="Box colour">
            <Select aria-label="Box colour" value={field.tone ?? 'info'} onChange={(e) => onChange({ tone: e.target.value as FormField['tone'] })}>
              <option value="info">Blue: information or next step</option>
              <option value="success">Green: well done or confirmation</option>
              <option value="warning">Amber: important or action needed</option>
              <option value="note">Grey: general note</option>
            </Select>
          </Field>
        )}
        {(field.type === 'rich_text' || field.type === 'callout') && (
          <>
            <ImageUpload label="Picture (optional)" value={field.image_url} prefix={`${assetPrefix}/questions/${field.id}`} onChange={image_url => onChange({ image_url })} contain />
            {field.image_url && <>
              <Field label="Picture description" hint="Describe the picture for people using a screen reader."><Input value={field.imageAlt ?? ''} onChange={e => onChange({ imageAlt: e.target.value })} /></Field>
              <Field label={`Picture width: ${field.imageWidth ?? 100}%`}><input aria-label="Picture width" type="range" min={25} max={100} value={field.imageWidth ?? 100} onChange={e => onChange({ imageWidth: Number(e.target.value) })} /></Field>
            </>}
          </>
        )}

        {!isContent && (
          <>
            <Field label="Placeholder" htmlFor="fs-ph">
              <Input id="fs-ph" value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} />
            </Field>
            <RichTextArea label="Description / instructions" rows={3} value={field.description ?? field.helpText ?? ''} onChange={description => onChange({ description })} />
            <ImageUpload label="Question photo" value={field.image_url} prefix={`${assetPrefix}/questions/${field.id}`} onChange={image_url => onChange({ image_url })} contain />
            {field.image_url && <>
              <Field label="Photo description" hint="Describe the photo for people using a screen reader."><Input value={field.imageAlt ?? ''} onChange={e => onChange({ imageAlt: e.target.value })} /></Field>
              <Field label={`Photo width: ${field.imageWidth ?? 100}%`}><input aria-label="Photo width" type="range" min={25} max={100} value={field.imageWidth ?? 100} onChange={e => onChange({ imageWidth: Number(e.target.value) })} /></Field>
            </>}
            <Field label="Photo and description position"><Select aria-label="Photo and description position" value={field.mediaPosition ?? 'belowLabel'} onChange={e => onChange({ mediaPosition: e.target.value as FormField['mediaPosition'] })}>
              <option value="above">Above the question</option><option value="belowLabel">Inside question, before the answer</option><option value="belowAnswer">Under the answer</option>
            </Select></Field>
            <Field label="Text alignment"><Select aria-label="Question text alignment" value={field.textAlign ?? 'left'} onChange={e => onChange({ textAlign: e.target.value as FormField['textAlign'] })}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </Select></Field>
            <Switch checked={!!field.required} onChange={(required) => onChange({ required })} label="Required" />
          </>
        )}

        {field.type === 'rating' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Scale" hint="Number of points.">
                <Select
                  value={String(field.options?.length ?? 5)}
                  onChange={(e) => onChange({ options: Array.from({ length: Number(e.target.value) }, (_, i) => String(i + 1)) })}
                  aria-label="Rating scale"
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>1 to {n}</option>)}
                </Select>
              </Field>
              <Field label="Shown as">
                <Select value={field.ratingIcon ?? 'number'} onChange={(e) => onChange({ ratingIcon: e.target.value as FormField['ratingIcon'] })} aria-label="Rating icon">
                  <option value="star">Stars</option>
                  <option value="heart">Hearts</option>
                  <option value="thumb">Thumbs up</option>
                  <option value="number">Numbered boxes</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lowest label" hint="Optional, e.g. Poor">
                <Input value={field.lowLabel ?? ''} onChange={(e) => onChange({ lowLabel: e.target.value || undefined })} />
              </Field>
              <Field label="Highest label" hint="Optional, e.g. Excellent">
                <Input value={field.highLabel ?? ''} onChange={(e) => onChange({ highLabel: e.target.value || undefined })} />
              </Field>
            </div>
          </>
        )}

        {(field.type === 'grid' || field.type === 'checkbox_grid') && (
          <>
            <OptionsEditor title="Rows" itemLabel="Row" options={field.rows ?? []} onChange={(rows) => onChange({ rows })} />
            <OptionsEditor title="Columns" itemLabel="Column" options={field.options ?? []} onChange={(options) => onChange({ options })} />
            {field.type === 'grid' && (
              <>
                <Switch
                  checked={!!field.onePerColumn}
                  onChange={(onePerColumn) => onChange({ onePerColumn })}
                  label="Limit to one response per column"
                  description="Each column can be chosen in one row only. Use this for rankings such as 1st, 2nd, 3rd."
                />
                <button
                  type="button"
                  onClick={() => onChange({
                    options: (field.rows ?? []).map((_, i) => ordinal(i + 1)),
                    onePerColumn: true,
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-navy-300 hover:text-navy-600"
                >
                  Make columns 1st, 2nd, 3rd... (one per row)
                </button>
              </>
            )}
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              When Required is on, every row must be answered.
            </p>
          </>
        )}

        {field.type === 'ranking' && (
          <>
            <OptionsEditor title="Items to rank" itemLabel="Item" options={field.options ?? []} onChange={(options) => onChange({ options })} />
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Columns are created automatically: 1st to {ordinal(Math.max(1, field.options?.length ?? 1))}. Each rank can be used once.
              When Required is on, every item must be ranked.
            </p>
          </>
        )}
        {field.type === 'evaluation' && (
          <Field label="Apply a preset" hint="You can edit, add and reorder the labels below.">
            <Select value="" onChange={(e) => {
              if (e.target.value === 'th') onChange({ options: ['ควรปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก', 'อื่น ๆ'] });
              if (e.target.value === 'en') onChange({ options: ['Needs improvement', 'Fair', 'Good', 'Very good', 'Other'] });
            }}>
              <option value="">Choose a preset</option>
              <option value="th">Thai satisfaction labels</option>
              <option value="en">English satisfaction labels</option>
            </Select>
          </Field>
        )}
        {selectionTypes.includes(field.type) && (
          <>
            <OptionsEditor
              options={field.options ?? []}
              onChange={(options, order) => onChange(field.type === 'picture_choice'
                // Pictures follow their option when options are moved or removed.
                ? { options, optionImages: order.map((old) => (old >= 0 ? field.optionImages?.[old] ?? '' : '')) }
                : { options })}
            />
            {canAllowOther(field) && (
              <>
                <Switch
                  checked={!!field.allowOther}
                  onChange={(allowOther) => onChange({ allowOther })}
                  label="Allow an 'Other' answer"
                  description="Adds one more choice with a box the registrant fills in themselves. The typed words are saved and exported with the other answers."
                />
                {field.allowOther && (
                  <Field label="Wording of the 'Other' choice" hint="Leave empty to use 'Other'.">
                    <Input
                      value={field.otherLabel ?? ''}
                      placeholder="Other"
                      onChange={(e) => onChange({ otherLabel: e.target.value || undefined })}
                    />
                  </Field>
                )}
              </>
            )}
            {field.type === 'menu_quantity' && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Registrants set a quantity for each menu item, e.g. for the whole family. The choices and amounts are printed on their ticket.
              </p>
            )}
          </>
        )}

        {field.type === 'picture_choice' && (field.options ?? []).length > 0 && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pictures for each option</p>
            {(field.options ?? []).map((o, i) => (
              <ImageUpload key={i} label={o || `Option ${i + 1}`} value={field.optionImages?.[i]} prefix={`${assetPrefix}/questions/${field.id}`} contain
                onChange={(url) => {
                  const images = [...(field.optionImages ?? [])];
                  images[i] = url ?? '';
                  onChange({ optionImages: images });
                }} />
            ))}
          </div>
        )}

        {field.type === 'slider' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="From">
                <Input type="number" value={field.validation?.min ?? 0} onChange={(e) => onChange({ validation: { ...field.validation, min: Number(e.target.value) || 0 } })} />
              </Field>
              <Field label="To">
                <Input type="number" value={field.validation?.max ?? 10} onChange={(e) => onChange({ validation: { ...field.validation, max: Number(e.target.value) || 10 } })} />
              </Field>
              <Field label="Step">
                <Input type="number" min={1} value={field.step ?? 1} onChange={(e) => onChange({ step: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label at the start" hint="Optional, e.g. Not likely">
                <Input value={field.lowLabel ?? ''} onChange={(e) => onChange({ lowLabel: e.target.value || undefined })} />
              </Field>
              <Field label="Label at the end" hint="Optional, e.g. Very likely">
                <Input value={field.highLabel ?? ''} onChange={(e) => onChange({ highLabel: e.target.value || undefined })} />
              </Field>
            </div>
          </>
        )}

        {field.type === 'consent' && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            The label is shown next to a single tick box. With Required on, the form cannot be sent until it is ticked. The answer is saved as "Agreed".
          </p>
        )}

        {field.type === 'number' && (
          <Switch
            checked={!!field.collectNames}
            onChange={(collectNames) => onChange({ collectNames })}
            label="Also ask for the names"
            description="When the number is 1 or more, a box appears asking for each name, one per line (e.g. staff members)."
          />
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

        {earlier.length > 0 && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conditional logic</p>
            <Field label={isContent ? 'Show this block only when' : 'Show this question only when'}
              hint="Example: show an instruction box only when someone answers 'Not yet'.">
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
                {cond.operator !== 'answered' && (sourceChoices.length > 0 && cond.operator !== 'contains' ? (
                  <Select value={cond.value ?? ''} onChange={(e) => setCondition({ value: e.target.value })} aria-label="Condition value">
                    <option value="">Choose an answer</option>
                    {sourceChoices.map((o) => <option key={o} value={o}>{o}</option>)}
                    {cond.value && !sourceChoices.includes(cond.value) && <option value={cond.value}>{cond.value} (no longer an option)</option>}
                  </Select>
                ) : (
                  <Input value={cond.value ?? ''} onChange={(e) => setCondition({ value: e.target.value })} placeholder="Value to compare" aria-label="Condition value" />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}


function OptionsEditor({ options, onChange, title = 'Options', itemLabel = 'Option' }: {
  options: string[];
  /** order[i] is the old position of the new option i, or -1 for a new one. */
  onChange: (options: string[], order: number[]) => void;
  title?: string;
  itemLabel?: string;
}) {
  const same = options.map((_, i) => i);
  function setAt(i: number, value: string) {
    onChange(options.map((o, idx) => (idx === i ? value : o)), same);
  }
  function removeAt(i: number) {
    onChange(options.filter((_, idx) => idx !== i), same.filter((idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options], order = [...same];
    [next[i], next[j]] = [next[j], next[i]];
    [order[i], order[j]] = [order[j], order[i]];
    onChange(next, order);
  }
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">{title}</span>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-xs text-slate-400">{itemLabel} {i + 1}:</span>
            <Textarea rows={2} value={o} onChange={(e) => setAt(i, e.target.value)} aria-label={`${itemLabel} ${i + 1}`} />
            <button type="button" aria-label={`Move ${itemLabel.toLowerCase()} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
            <button type="button" aria-label={`Move option ${i + 1} down`} disabled={i === options.length - 1} onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
            <button type="button" aria-label={`Remove option ${i + 1}`} onClick={() => removeAt(i)} className="rounded p-1 text-red-300 hover:text-red-500"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...options, ''], [...same, -1])}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-navy-300 hover:text-navy-600"
      >
        <Plus className="h-3.5 w-3.5" /> Add {itemLabel.toLowerCase()}
      </button>
    </div>
  );
}
