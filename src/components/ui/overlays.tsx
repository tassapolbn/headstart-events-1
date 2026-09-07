import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './basics';

// ------------------------------------------------------------------
// Modal
// ------------------------------------------------------------------

/**
 * Reference counted so nested or sibling dialogs (a confirm on top of a detail
 * modal) cannot leave the page permanently unscrollable when one of them closes.
 */
let scrollLocks = 0;

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

  useEffect(() => {
    if (!open) return;
    scrollLocks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      scrollLocks -= 1;
      if (scrollLocks <= 0) {
        scrollLocks = 0;
        document.body.style.overflow = '';
      }
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6 no-print"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            // A gentle spring settles without the rubbery overshoot of a bouncy one.
            transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
            className={cn(
              'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl shadow-navy-900/25 sm:rounded-2xl',
              wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'
            )}
          >
            {/* Grab handle: the sheet slides up from the bottom edge on phones */}
            <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-display text-base font-semibold tracking-tight text-navy-800">{title}</h2>
              <button
                onClick={onClose} aria-label="Close dialog"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
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
export function Tabs({ tabs, active, onChange, className }: {
  tabs: Array<{ id: string; label: string; icon?: ReactNode }>;
  active: string; onChange: (id: string) => void; className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1.5', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold',
            'transition-all duration-200 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-300',
            active === t.id
              ? 'bg-white text-navy-800 shadow-sm ring-1 ring-slate-200/70'
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
