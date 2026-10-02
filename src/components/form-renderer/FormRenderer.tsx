import { useEffect, useMemo, type ReactNode } from 'react';
import { Controller, useForm, type FieldValues } from 'react-hook-form';
import { Paperclip } from 'lucide-react';
import type { EventTheme, FormField } from '@/lib/types';
import { buildResolver, isContentField, isVisible, OTHER_VALUE, otherLabelOf } from './fieldZod';
import { SignaturePad } from './SignaturePad';
import { GridInput, RatingInput } from './ScaleAndGrid';
import { buttonClass, usesQuestionCards } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/basics';
import { richToHtml } from '@/components/ui/RichTextArea';
import { FormattedText } from '@/components/ui/FormattedText';
import { ensureContentFonts } from '@/lib/fonts';

const calloutTone: Record<string, string> = {
  info: 'border-sky-500 bg-sky-50 text-sky-950',
  success: 'border-emerald-500 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-500 bg-amber-50 text-amber-950',
  note: 'border-slate-400 bg-slate-50 text-slate-800',
};

/** The optional picture on a text block or instruction box. */
function BlockImage({ field }: { field: FormField }) {
  if (!field.image_url) return null;
  return (
    <img src={field.image_url} alt={field.imageAlt || ''} loading="lazy" className="block h-auto max-w-full rounded-lg object-contain"
      style={{ width: `${Math.min(100, Math.max(25, field.imageWidth ?? 100))}%`, marginLeft: field.textAlign === 'center' || field.textAlign === 'right' ? 'auto' : undefined, marginRight: field.textAlign === 'center' ? 'auto' : undefined }} />
  );
}

const inputCls =
  'ev-input w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400';

function FieldShell({ field, error, children }: { field: FormField; error?: string; children: ReactNode }) {
  const description = field.description ?? field.helpText;
  const details = <div id={`${field.id}-description`} className="space-y-2" style={{ textAlign: field.textAlign }}>
    {description && <div className="ev-rich ev-help text-sm" dangerouslySetInnerHTML={{ __html: richToHtml(description) }} />}
    {field.image_url && <img src={field.image_url} alt={field.imageAlt || ''} loading="lazy" className="h-auto max-w-full rounded-lg object-contain"
      style={{ width: `${Math.min(100, Math.max(25, field.imageWidth ?? 100))}%`, marginLeft: field.textAlign === 'right' || field.textAlign === 'center' ? 'auto' : undefined, marginRight: field.textAlign === 'center' ? 'auto' : undefined }} />}
  </div>;
  const position = field.mediaPosition ?? 'belowLabel';
  return (
    <div className="space-y-1.5">
      {position === 'above' && details}
      <label htmlFor={field.id} className="ev-q-label block" style={{ textAlign: field.textAlign }}>
        <FormattedText value={field.labelHtml ?? field.label} />
        {field.required && <span className="ml-0.5" style={{ color: 'var(--ev-primary)' }} aria-hidden="true">*</span>}
      </label>
      {position === 'belowLabel' && details}
      {children}
      {position === 'belowAnswer' && details}
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export function FormRenderer({
  fields, onSubmit, busy, theme, submitLabel = 'Submit registration',
  beforeSubmit, submitDisabled, preview, onValuesChange,
}: {
  fields: FormField[];
  onSubmit: (values: FieldValues) => void | Promise<void>;
  busy?: boolean;
  theme?: EventTheme;
  submitLabel?: string;
  beforeSubmit?: ReactNode;
  submitDisabled?: boolean;
  preview?: boolean;
  /** Live answers, e.g. so the booth picker can react to the vendor type */
  onValuesChange?: (values: FieldValues) => void;
}) {
  const resolver = useMemo(() => buildResolver(fields), [fields]);
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm({ resolver, mode: 'onBlur' });
  const values = watch();
  const questionCards = usesQuestionCards(theme);
  useEffect(() => ensureContentFonts(JSON.stringify(fields)), [fields]);

  useEffect(() => {
    if (!onValuesChange) return;
    const sub = watch((v) => onValuesChange(v));
    return () => sub.unsubscribe();
  }, [watch, onValuesChange]);

  function renderControl(f: FormField, err?: string): ReactNode {
    switch (f.type) {
      case 'heading':
        return (
          <h3 className="pt-2 text-lg font-bold" style={{ color: 'var(--ev-heading)', fontFamily: 'var(--ev-heading-font)' }}>
            <FormattedText value={f.content || f.label} />
          </h3>
        );
      case 'rich_text':
        return (
          <div className="space-y-3">
            <div
              className="ev-rich max-w-none text-sm opacity-90"
              dangerouslySetInnerHTML={{ __html: richToHtml(f.content ?? '') }}
            />
            <BlockImage field={f} />
          </div>
        );
      case 'callout':
        return (
          <div className={cn('ev-callout space-y-3 rounded-xl border-l-4 px-4 py-3', calloutTone[f.tone ?? 'info'])} role="note">
            <div className="ev-rich max-w-none text-sm" dangerouslySetInnerHTML={{ __html: richToHtml(f.content ?? '') }} />
            <BlockImage field={f} />
          </div>
        );
      case 'divider':
        return (
          <div className="flex items-center gap-3 py-2" role="separator" aria-label="Section divider">
            <span className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, var(--ev-primary))', opacity: 0.35 }} />
            {f.content ? (
              <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ev-heading)' }}><FormattedText value={f.content} /></span>
            ) : (
              <span className="flex gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ev-primary)' }} />
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ev-secondary)' }} />
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ev-primary)' }} />
              </span>
            )}
            <span className="h-px flex-1" style={{ background: 'linear-gradient(to left, transparent, var(--ev-primary))', opacity: 0.35 }} />
          </div>
        );
      case 'paragraph':
        return (
          <FieldShell field={f} error={err}>
            <textarea id={f.id} rows={4} placeholder={f.placeholder} className={inputCls} aria-invalid={!!err} {...register(f.id)} />
          </FieldShell>
        );
      case 'dropdown':
        return (
          <FieldShell field={f} error={err}>
            <select id={f.id} className={inputCls} aria-invalid={!!err} defaultValue="" {...register(f.id)}>
              <option value="" disabled>{f.placeholder || 'Please select'}</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FieldShell>
        );
      case 'rating':
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue=""
              render={({ field: rhf }) => (
                <RatingInput field={f} value={rhf.value ?? ''} onChange={rhf.onChange} onBlur={rhf.onBlur} invalid={!!err} />
              )}
            />
          </FieldShell>
        );
      case 'grid':
      case 'checkbox_grid':
      case 'ranking':
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue={{}}
              render={({ field: rhf }) => (
                <GridInput field={f} value={rhf.value} onChange={rhf.onChange} onBlur={rhf.onBlur} invalid={!!err} />
              )}
            />
          </FieldShell>
        );
      case 'evaluation':
      case 'radio':
      case 'multiple_choice': {
        const otherOn = values[f.id] === OTHER_VALUE;
        return (
          <FieldShell field={f} error={err}>
            <div role="radiogroup" aria-label={f.label} aria-required={!!f.required} aria-invalid={!!err} className="grid gap-2">
              {(f.options ?? []).map((o) => (
                <label key={o} className="ev-choice">
                  <input type="radio" value={o} className="h-4 w-4" {...register(f.id)} />
                  <span>{o}</span>
                </label>
              ))}
              {f.type === 'multiple_choice' && f.allowOther && (
                /* A div, not a label: a label would toggle the radio whenever the
                   free text box is clicked. */
                <div className={cn('ev-choice', otherOn && 'is-on')}>
                  <input
                    id={`${f.id}__other_pick`} type="radio" value={OTHER_VALUE} className="h-4 w-4"
                    {...register(f.id)}
                  />
                  <label htmlFor={`${f.id}__other_pick`} className="shrink-0 cursor-pointer">{otherLabelOf(f)}:</label>
                  <input
                    type="text" className="ev-other-input" placeholder="Your answer"
                    aria-label={`${f.label}: ${otherLabelOf(f)}`}
                    {...register(`${f.id}__other`)}
                    onFocus={() => setValue(f.id, OTHER_VALUE, { shouldValidate: false })}
                  />
                </div>
              )}
            </div>
          </FieldShell>
        );
      }
      case 'yes_no':
        return (
          <FieldShell field={f} error={err}>
            <div role="radiogroup" aria-label={f.label} aria-required={!!f.required} aria-invalid={!!err} className="flex flex-wrap gap-2">
              {(f.options ?? []).map((o) => (
                <label key={o} className="ev-choice ev-pill flex-1 justify-center text-center font-semibold" style={{ minWidth: '6rem' }}>
                  <input type="radio" value={o} className="sr-only" {...register(f.id)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </FieldShell>
        );
      case 'picture_choice':
        return (
          <FieldShell field={f} error={err}>
            <div role="radiogroup" aria-label={f.label} aria-required={!!f.required} aria-invalid={!!err} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(f.options ?? []).map((o, i) => (
                <label key={o} className="ev-choice ev-picture flex-col items-stretch gap-2 p-2">
                  {f.optionImages?.[i]
                    ? <img src={f.optionImages[i]} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                    : <span className="flex aspect-square w-full items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">No picture</span>}
                  <span className="flex items-center gap-2 text-sm">
                    <input type="radio" value={o} className="h-4 w-4" {...register(f.id)} />
                    <span>{o}</span>
                  </span>
                </label>
              ))}
            </div>
          </FieldShell>
        );
      case 'slider': {
        const min = f.validation?.min ?? 0, max = f.validation?.max ?? 10;
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue=""
              render={({ field: rhf }) => (
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <input
                      id={f.id} type="range" min={min} max={max} step={f.step || 1}
                      value={rhf.value === '' || rhf.value == null ? Math.round((min + max) / 2) : rhf.value}
                      onChange={(e) => rhf.onChange(e.target.value)} onBlur={rhf.onBlur}
                      className={cn('w-full', rhf.value === '' && 'opacity-50')} style={{ accentColor: 'var(--ev-primary)' }}
                      aria-valuetext={rhf.value === '' ? 'Not chosen yet' : String(rhf.value)} aria-invalid={!!err}
                    />
                    <span className="w-12 shrink-0 rounded-lg border border-slate-200 bg-white py-1 text-center text-sm font-bold" aria-hidden="true">
                      {rhf.value === '' ? '?' : rhf.value}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs opacity-70" aria-hidden="true">
                    <span>{min}{f.lowLabel ? ` ${f.lowLabel}` : ''}</span>
                    <span>{max}{f.highLabel ? ` ${f.highLabel}` : ''}</span>
                  </div>
                </div>
              )}
            />
          </FieldShell>
        );
      }
      case 'consent':
        return (
          <div className="space-y-1.5">
            <Controller
              control={control}
              name={f.id}
              defaultValue=""
              render={({ field: rhf }) => (
                <label className="ev-choice items-start" style={{ textAlign: f.textAlign }}>
                  <input
                    id={f.id} type="checkbox" className="mt-0.5 h-4 w-4"
                    checked={rhf.value === 'Agreed'} onChange={(e) => rhf.onChange(e.target.checked ? 'Agreed' : '')} onBlur={rhf.onBlur}
                    aria-invalid={!!err} aria-required={!!f.required}
                  />
                  <span>
                    <FormattedText value={f.labelHtml ?? f.label} />
                    {f.required && <span className="ml-0.5" style={{ color: 'var(--ev-primary)' }} aria-hidden="true">*</span>}
                  </span>
                </label>
              )}
            />
            {(f.description ?? f.helpText) && <div className="ev-rich ev-help text-sm" dangerouslySetInnerHTML={{ __html: richToHtml(f.description ?? f.helpText ?? '') }} />}
            {err && <p role="alert" className="text-xs font-medium text-red-600">{err}</p>}
          </div>
        );
      case 'menu_quantity':
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue={{}}
              render={({ field: rhf }) => {
                const counts: Record<string, number> = rhf.value ?? {};
                const setCount = (opt: string, n: number) => {
                  const next = { ...counts, [opt]: Math.max(0, Math.min(20, n)) };
                  if (next[opt] === 0) delete next[opt];
                  rhf.onChange(next);
                };
                return (
                  <div className="space-y-2" role="group" aria-label={f.label}>
                    {(f.options ?? []).map((o) => {
                      const n = counts[o] ?? 0;
                      return (
                        <div key={o} className={cn('ev-row', n > 0 && 'is-on')}>
                          <span className="min-w-0 flex-1 text-sm">{o}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button" aria-label={`Fewer ${o}`}
                              onClick={() => setCount(o, n - 1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-lg leading-none disabled:opacity-30"
                              disabled={n === 0}
                            >
                              -
                            </button>
                            <span className="w-6 text-center text-sm font-bold" aria-live="polite">{n}</span>
                            <button
                              type="button" aria-label={`More ${o}`}
                              onClick={() => setCount(o, n + 1)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-white"
                              style={{ background: 'var(--ev-primary)' }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {Object.keys(counts).length > 0 && (
                      <p className="text-xs opacity-70">
                        Total: {Object.values(counts).reduce((a, b) => a + b, 0)} item(s)
                      </p>
                    )}
                  </div>
                );
              }}
            />
          </FieldShell>
        );
      case 'checkboxes':
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue={[]}
              render={({ field: rhf }) => {
                const list: string[] = Array.isArray(rhf.value) ? rhf.value : [];
                const setOn = (o: string, on: boolean) =>
                  rhf.onChange(on ? [...list.filter((x) => x !== o), o] : list.filter((x) => x !== o));
                const otherOn = list.includes(OTHER_VALUE);
                return (
                  <div className="grid gap-2" role="group" aria-label={f.label}>
                    {(f.options ?? []).map((o) => {
                      const checked = list.includes(o);
                      return (
                        <label key={o} className={cn('ev-choice', checked && 'is-on')}>
                          <input
                            type="checkbox" checked={checked} className="h-4 w-4 rounded"
                            onChange={(e) => setOn(o, e.target.checked)}
                            onBlur={rhf.onBlur}
                          />
                          <span>{o}</span>
                        </label>
                      );
                    })}
                    {f.allowOther && (
                      /* A div, not a label: a label would tick the box whenever the
                         free text box is clicked. */
                      <div className={cn('ev-choice', otherOn && 'is-on')}>
                        <input
                          id={`${f.id}__other_pick`} type="checkbox" checked={otherOn} className="h-4 w-4 rounded"
                          onChange={(e) => setOn(OTHER_VALUE, e.target.checked)}
                          onBlur={rhf.onBlur}
                        />
                        <label htmlFor={`${f.id}__other_pick`} className="shrink-0 cursor-pointer">{otherLabelOf(f)}:</label>
                        <input
                          type="text" className="ev-other-input" placeholder="Your answer"
                          aria-label={`${f.label}: ${otherLabelOf(f)}`}
                          {...register(`${f.id}__other`)}
                          onFocus={() => { if (!otherOn) setOn(OTHER_VALUE, true); }}
                        />
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </FieldShell>
        );
      case 'file':
      case 'photo':
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              render={({ field: rhf }) => {
                const file = rhf.value as File | undefined;
                return (
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 hover:border-slate-400">
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate">{file ? file.name : (f.type === 'photo' ? 'Choose a photo' : 'Choose a file')}</span>
                    <input
                      id={f.id}
                      type="file"
                      className="sr-only"
                      accept={f.type === 'photo' ? 'image/*' : f.accept || undefined}
                      onChange={(e) => rhf.onChange(e.target.files?.[0])}
                    />
                  </label>
                );
              }}
            />
          </FieldShell>
        );
      case 'signature':
        return (
          <FieldShell field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue=""
              render={({ field: rhf }) => (
                <SignaturePad value={rhf.value ?? ''} onChange={rhf.onChange} ariaLabel={f.label} />
              )}
            />
          </FieldShell>
        );
      case 'number': {
        const numValue = Number(values[f.id] ?? 0);
        return (
          <div className="space-y-3">
            <FieldShell field={f} error={err}>
              <input
                id={f.id} type="number" placeholder={f.placeholder} className={inputCls}
                aria-invalid={!!err} inputMode="numeric"
                min={f.validation?.min} max={f.validation?.max}
                {...register(f.id)}
              />
            </FieldShell>
            {f.collectNames && numValue >= 1 && (
              <div className="space-y-1.5 rounded-lg bg-slate-50/70 p-3">
                <label htmlFor={`${f.id}__names`} className="ev-q-label block">
                  Please list the {numValue > 1 ? `${numValue} names` : 'name'} (one per line)
                </label>
                <textarea
                  id={`${f.id}__names`} rows={Math.min(8, Math.max(2, numValue))}
                  className={inputCls} placeholder={'Name 1\nName 2'}
                  {...register(`${f.id}__names`)}
                />
              </div>
            )}
          </div>
        );
      }
      case 'date':
      case 'time':
      case 'datetime':
      case 'url':
      case 'email':
      case 'phone':
      case 'short_text':
      default: {
        const typeMap: Record<string, string> = {
          date: 'date', time: 'time', email: 'email', phone: 'tel', short_text: 'text', url: 'url', datetime: 'datetime-local',
        };
        return (
          <FieldShell field={f} error={err}>
            <input
              id={f.id}
              type={typeMap[f.type] ?? 'text'}
              placeholder={f.placeholder}
              className={inputCls}
              aria-invalid={!!err}
              inputMode={f.type === 'phone' ? 'tel' : undefined}
              {...register(f.id)}
            />
          </FieldShell>
        );
      }
    }
  }

  function renderField(f: FormField) {
    if (!isVisible(f, values, fields)) return null;
    const err = errors[f.id]?.message as string | undefined;
    const control = renderControl(f, err);
    // Headings, dividers and rich text mark out sections, so they are never boxed.
    const boxed = questionCards && !isContentField(f);
    return (
      <div key={f.id} className={boxed ? 'ev-q-card' : undefined}>
        {control}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v))} noValidate>
      <div className="ev-form-stack">{fields.map(renderField)}</div>
      {beforeSubmit && <div className="mt-5">{beforeSubmit}</div>}
      <button
        type="submit"
        disabled={busy || submitDisabled || preview}
        className={cn(
          buttonClass(theme),
          'mt-5 flex w-full items-center justify-center gap-2 px-5 py-3.5 text-base font-bold shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0'
        )}
      >
        {busy && <Spinner size={16} />}
        <FormattedText value={preview ? `${submitLabel} (preview)` : submitLabel} />
      </button>
    </form>
  );
}
