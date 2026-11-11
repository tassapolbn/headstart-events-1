import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './basics';

// ------------------------------------------------------------------
// Modal
// ------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string;
  children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Keep the page behind the dialog still while it is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6 no-print"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className={cn(
              'flex max-h-[92vh] max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
              wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'
            )}
          >
            {/* Grab handle: a cue on phones that this is a bottom sheet. */}
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 pl-5 pr-2 sm:py-3">
              <h2 className="min-w-0 font-display text-base font-semibold text-navy-800">{title}</h2>
              <button
                onClick={onClose} aria-label="Close dialog"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 sm:h-9 sm:w-9"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && (
              <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-3 [&>*]:w-full sm:[&>*]:w-auto">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------
// ConfirmDialog
// ------------------------------------------------------------------
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger }: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; danger?: boolean;
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Tabs
// ------------------------------------------------------------------
/**
 * One row of tabs. On a phone the row scrolls sideways instead of wrapping
 * into a tall block, and the chosen tab is kept in view.
 */
export function Tabs({ tabs, active, onChange, className }: {
  tabs: Array<{ id: string; label: string; icon?: ReactNode }>;
  active: string; onChange: (id: string) => void; className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the tab row sideways, never the page.
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
    }
  }, [active]);

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        'no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0',
        className
      )}
    >
      <div className="flex min-w-max gap-1 rounded-xl bg-slate-200/60 p-1 lg:min-w-0 lg:flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition sm:min-h-9',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300',
              active === t.id ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// SegmentedControl: a compact filter row, e.g. status filters
// ------------------------------------------------------------------
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: {
  options: Array<{ id: T; label: ReactNode }>;
  value: T; onChange: (id: T) => void; label: string; className?: string;
}) {
  return (
    <div className={cn('no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="group" aria-label={label} className="flex w-max gap-1 rounded-xl bg-slate-200/60 p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'min-h-11 shrink-0 whitespace-nowrap rounded-lg px-3 text-xs font-medium capitalize transition sm:min-h-8',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300',
              value === o.id ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// ActionMenu: secondary actions behind a "More" button
// ------------------------------------------------------------------
export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  /** Opens a link in a new tab instead of running onClick. */
  href?: string;
  danger?: boolean;
  hidden?: boolean;
}

/**
 * The menu is drawn in a fixed layer so a card with hidden overflow never
 * clips it. It opens upwards when there is no room below.
 */
export function ActionMenu({ items, label = 'More actions', className, buttonLabel }: {
  items: ActionMenuItem[]; label?: string; className?: string; buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number; maxHeight?: number }>({ right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shown = items.filter((i) => !i.hidden);

  // Measure the real menu, then open it on the side with room. If neither
  // side fits, use the roomier one and let the menu scroll.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const gap = 4, edge = 8;
    const right = Math.max(edge, window.innerWidth - r.right);
    const height = menuRef.current.scrollHeight;
    const below = window.innerHeight - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    if (height <= below || below >= above) {
      setPos({ top: r.bottom + gap, right, maxHeight: Math.max(below, 96) });
    } else {
      setPos({ bottom: window.innerHeight - r.top + gap, right, maxHeight: Math.max(above, 96) });
    }
  }, [open, shown.length]);

  useEffect(() => {
    if (!open) return;
    function close(e: Event) {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    }
    const shut = () => setOpen(false);
    // Scrolling the page moves the button away from the menu, so close it;
    // scrolling inside a long menu does not.
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', shut);
    window.addEventListener('scroll', onScroll, true);
    // Move focus into the menu for keyboard users.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', shut);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function onMenuKey(e: ReactKeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next]?.focus();
  }

  if (shown.length === 0) return null;
  const itemClass = (danger?: boolean) => cn(
    'flex min-h-11 w-full shrink-0 items-center gap-2.5 px-3.5 text-left text-sm transition sm:min-h-9',
    'focus-visible:bg-slate-100 focus-visible:outline-none',
    danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={buttonLabel ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300 sm:min-h-8 sm:min-w-8 sm:text-xs',
          open && 'bg-slate-100',
          className
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
        {buttonLabel}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className="no-print fixed z-[60] w-56 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          style={{ top: pos.top, bottom: pos.bottom, right: pos.right, maxHeight: pos.maxHeight }}
        >
          {shown.map((item) =>
            item.href ? (
              <a
                key={item.label} role="menuitem" href={item.href} target="_blank" rel="noreferrer"
                className={itemClass(item.danger)} onClick={() => setOpen(false)}
              >
                {item.icon}{item.label}
              </a>
            ) : (
              <button
                key={item.label} role="menuitem" type="button"
                className={itemClass(item.danger)}
                onClick={() => { setOpen(false); item.onClick?.(); }}
              >
                {item.icon}{item.label}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}
