import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------
// Button
// ------------------------------------------------------------------
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest
}: ButtonProps) {
  // Solid buttons carry a tinted shadow rather than a grey one: it reads as the
  // button lifting off the page instead of a generic drop shadow.
  const variants = {
    primary: 'bg-navy-700 text-white shadow-sm shadow-navy-700/25 hover:bg-navy-600 hover:shadow-md hover:shadow-navy-700/25 focus-visible:ring-navy-400',
    secondary: 'bg-gold-400 text-navy-900 shadow-sm shadow-gold-400/30 hover:bg-gold-300 focus-visible:ring-gold-500',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-navy-300',
    ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300',
    danger: 'bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-500 focus-visible:ring-red-400',
  };
  const sizes = { sm: 'min-h-9 px-3 py-1.5 text-sm', md: 'min-h-11 px-4 py-2 text-sm', lg: 'min-h-12 px-5 py-2.5 text-base' };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        variants[variant], sizes[size], className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------
// Badge
// ------------------------------------------------------------------
// An inset ring gives each badge a crisp edge on both white cards and tinted
// rows, without the heavy look of a full border.
const badgeColors = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
  gold: 'bg-gold-50 text-gold-800 ring-gold-200',
  navy: 'bg-navy-50 text-navy-700 ring-navy-200',
};

export function Badge({ color = 'gray', children, className }: {
  color?: keyof typeof badgeColors; children: ReactNode; className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', badgeColors[color], className)}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------
// Spinner
// ------------------------------------------------------------------
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24"
      fill="none" aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ------------------------------------------------------------------
// Card
// ------------------------------------------------------------------
export function Card({ title, actions, children, className, padded = true }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold tracking-tight text-navy-800">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------
// EmptyState
// ------------------------------------------------------------------
export function EmptyState({ icon, title, hint, action }: {
  icon?: ReactNode; title: string; hint?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------
// StatCard
// ------------------------------------------------------------------
export function StatCard({ label, value, hint, icon, tone = 'navy' }: {
  label: string; value: ReactNode; hint?: string; icon?: ReactNode;
  tone?: 'navy' | 'gold' | 'green' | 'red' | 'slate';
}) {
  const tones = {
    navy: 'bg-navy-50 text-navy-700',
    gold: 'bg-gold-50 text-gold-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      {icon && <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="font-display text-2xl font-bold leading-tight tabular-nums text-navy-800">{value}</p>
        {hint && <p className="truncate text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}
