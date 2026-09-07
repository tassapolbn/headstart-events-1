import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// A 3px focus ring at 40% opacity is visible at a glance without the harsh
// "selected" look a solid ring gives on a dense admin form.
const baseInput =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm ' +
  'transition-colors duration-150 hover:border-slate-400 ' +
  'placeholder:text-slate-400 focus:border-navy-400 focus:outline-none focus:ring-[3px] focus:ring-navy-200/70 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 aria-[invalid=true]:border-red-400';

export function Field({ label, hint, error, required, htmlFor, children, className }: {
  label?: string; hint?: string; error?: string; required?: boolean;
  htmlFor?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-red-500" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(baseInput, className)} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(baseInput, className)} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(baseInput, 'pr-8', className)} {...props}>
        {children}
      </select>
    );
  }
);

export function Switch({ checked, onChange, label, disabled, description }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; description?: string;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 focus-visible:ring-offset-2',
          checked ? 'bg-navy-700' : 'bg-slate-300 hover:bg-slate-400'
        )}
      >
        {/* A slight overshoot curve makes the knob feel physical rather than linear. */}
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)]',
            checked ? 'left-[22px]' : 'left-0.5'
          )}
        />
      </button>
      {(label || description) && (
        <span className="select-none">
          {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function ColorInput({ value, onChange, label }: {
  value: string; onChange: (v: string) => void; label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && <span className="block text-sm font-medium text-slate-700">{label}</span>}
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label ? `${label} colour picker` : 'Colour picker'}
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-lg border border-slate-300 bg-white p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 font-mono text-xs uppercase"
          aria-label={label ? `${label} hex value` : 'Hex value'}
        />
      </div>
    </div>
  );
}
