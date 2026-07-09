import { useEffect, useMemo, type ReactNode } from 'react';
import { Controller, useForm, type FieldValues } from 'react-hook-form';
import { Paperclip } from 'lucide-react';
import type { EventTheme, FormField } from '@/lib/types';
import { buildResolver, isContentField, isVisible } from './fieldZod';
import { SignaturePad } from './SignaturePad';
import { buttonClass } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/basics';
import { richToHtml } from '@/components/ui/RichTextArea';

const inputCls =
  'ev-input w-full border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400';

function FieldShell({ field, error, children }: { field: FormField; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={field.id} className="block text-sm font-semibold">
        {field.label}
        {field.required && <span className="ml-0.5" style={{ color: 'var(--ev-primary)' }} aria-hidden="true">*</span>}
      </label>
      {field.helpText && <p className="text-xs opacity-70">{field.helpText}</p>}
      {children}
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
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm({ resolver, mode: 'onBlur' });
  const values = watch();

  useEffect(() => {
    if (!onValuesChange) return;
    const sub = watch((v) => onValuesChange(v));
    return () => sub.unsubscribe();
  }, [watch, onValuesChange]);

  function renderField(f: FormField) {
    if (!isVisible(f, values)) return null;
    const err = errors[f.id]?.message as string | undefined;

    switch (f.type) {
      case 'heading':
        return (
          <h3 key={f.id} className="pt-2 text-lg font-bold" style={{ color: 'var(--ev-heading)' }}>
            {f.content || f.label}
          </h3>
        );
      case 'rich_text':
        return (
          <div
            key={f.id}
            className="ev-rich max-w-none text-sm opacity-90"
            dangerouslySetInnerHTML={{ __html: richToHtml(f.content ?? '') }}
          />
        );
      case 'divider':
        return (
          <div key={f.id} className="flex items-center gap-3 py-2" role="separator" aria-label="Section divider">
            <span className="h-px flex-1" style={{ background: 'linear-gradient(to right, transparent, var(--ev-primary))', opacity: 0.35 }} />
            {f.content ? (
              <span className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--ev-heading)' }}>{f.content}</span>
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
          <FieldShell key={f.id} field={f} error={err}>
            <textarea id={f.id} rows={4} placeholder={f.placeholder} className={inputCls} aria-invalid={!!err} {...register(f.id)} />
          </FieldShell>
        );
      case 'dropdown':
        return (
          <FieldShell key={f.id} field={f} error={err}>
            <select id={f.id} className={inputCls} aria-invalid={!!err} defaultValue="" {...register(f.id)}>
              <option value="" disabled>{f.placeholder || 'Please select'}</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </FieldShell>
        );
      case 'radio':
      case 'multiple_choice':
        return (
          <FieldShell key={f.id} field={f} error={err}>
            <div role="radiogroup" aria-label={f.label} className="space-y-2">
              {(f.options ?? []).map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition hover:border-slate-300 has-[:checked]:border-[var(--ev-primary)] has-[:checked]:bg-[var(--ev-bg)] has-[:checked]:font-semibold"
                >
                  <input type="radio" value={o} className="h-4 w-4" style={{ accentColor: 'var(--ev-primary)' }} {...register(f.id)} />
                  {o}
                </label>
              ))}
              {f.type === 'multiple_choice' && f.allowOther && (
                <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm transition hover:border-slate-300 has-[:checked]:border-[var(--ev-primary)] has-[:checked]:font-semibold">
                  <input type="radio" value="__other__" className="h-4 w-4" style={{ accentColor: 'var(--ev-primary)' }} {...register(f.id)} />
                  Other:
                  <input
                    type="text" className={cn(inputCls, 'flex-1 py-1.5')} aria-label={`${f.label}: other answer`}
                    {...register(`${f.id}__other`)}
                  />
                </label>
              )}
            </div>
          </FieldShell>
        );
      case 'menu_quantity':
        return (
          <FieldShell key={f.id} field={f} error={err}>
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
                        <div key={o} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
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
          <FieldShell key={f.id} field={f} error={err}>
            <Controller
              control={control}
              name={f.id}
              defaultValue={[]}
              render={({ field: rhf }) => (
                <div className="space-y-2" role="group" aria-label={f.label}>
                  {(f.options ?? []).map((o) => {
                    const list: string[] = rhf.value ?? [];
                    const checked = list.includes(o);
                    return (
                      <label
                        key={o}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-xl border bg-white px-3.5 py-2.5 text-sm transition hover:border-slate-300 ${checked ? 'border-[var(--ev-primary)] font-semibold' : 'border-slate-200'}`}
                      >
                        <input
                          type="checkbox" checked={checked} className="h-4 w-4 rounded"
                          style={{ accentColor: 'var(--ev-primary)' }}
                          onChange={(e) =>
                            rhf.onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))
                          }
                        />
                        {o}
                      </label>
                    );
                  })}
                </div>
              )}
            />
          </FieldShell>
        );
      case 'file':
      case 'photo':
        return (
          <FieldShell key={f.id} field={f} error={err}>
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
          <FieldShell key={f.id} field={f} error={err}>
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
          <div key={f.id} className="space-y-3">
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
                <label htmlFor={`${f.id}__names`} className="block text-sm font-semibold">
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
      case 'email':
      case 'phone':
      case 'short_text':
      default: {
        const typeMap: Record<string, string> = {
          date: 'date', time: 'time', email: 'email', phone: 'tel', short_text: 'text',
        };
        return (
          <FieldShell key={f.id} field={f} error={err}>
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

  return (
    <form
      onSubmit={handleSubmit((v) => onSubmit(v))}
      className="space-y-5"
      noValidate
    >
      {fields.map(renderField)}
      {beforeSubmit}
      <button
        type="submit"
        disabled={busy || submitDisabled || preview}
        className={cn(
          buttonClass(theme),
          'flex w-full items-center justify-center gap-2 px-5 py-3.5 text-base font-bold shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0'
        )}
      >
        {busy && <Spinner size={16} />}
        {preview ? `${submitLabel} (preview)` : submitLabel}
      </button>
    </form>
  );
}
