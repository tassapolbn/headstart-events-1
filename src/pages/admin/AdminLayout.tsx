import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays, LayoutDashboard, LogOut, Menu, Settings, Shapes, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCampus } from '@/context/CampusContext';
import { CampusSwitcher } from '@/components/CampusSwitcher';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/events', label: 'Events', icon: CalendarDays },
  { to: '/admin/templates', label: 'Templates', icon: Shapes },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { session, signOut, displayName } = useAuth();
  const { campus } = useCampus();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close the phone menu whenever the page changes.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // The phone menu disappears at desktop width, so close it there too.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onChange = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  // While the phone menu is open: keep the page behind it still and out of
  // reach of the keyboard, start focus in the menu, and hand focus back to
  // the menu button when it closes.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const page = mainRef.current;
    page?.setAttribute('inert', '');
    page?.setAttribute('aria-hidden', 'true');
    drawerRef.current?.querySelector<HTMLElement>('a[href], button')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the menu and its toggle button.
      const items = [toggleRef.current, ...(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([tabindex="-1"])') ?? [])]
        .filter((el): el is HTMLElement => !!el);
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0]?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      page?.removeAttribute('inert');
      page?.removeAttribute('aria-hidden');
      window.removeEventListener('keydown', onKey);
      if (drawerRef.current?.contains(document.activeElement) || document.activeElement === document.body) {
        toggleRef.current?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Admin navigation">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition lg:min-h-10',
              isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#F0B323]' : 'text-navy-100 hover:bg-white/5 hover:text-white'
            )
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const signOutButton = (
    <button
      onClick={() => void signOut()}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-navy-100 transition hover:bg-white/5 hover:text-white lg:min-h-10"
    >
      <LogOut className="h-5 w-5" /> Sign out
    </button>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {campus && (
        <div className="fixed inset-x-0 top-0 z-40 h-1" style={{ background: campus.accent }} aria-hidden="true" />
      )}
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-navy-800 lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="font-display text-sm font-bold text-white">HeadStart Events</p>
            <p className="text-[11px] text-navy-200">Registration Platform</p>
          </div>
        </div>
        <div className="px-3 pb-2">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-navy-300">Campus</p>
          <CampusSwitcher variant="sidebar" />
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-white/10 p-3">
          <p className="truncate px-3 pb-2 text-xs text-navy-200">{displayName || session?.user.email}</p>
          {signOutButton}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone and tablet top bar */}
        <header className="no-print sticky top-0 z-40 flex h-14 items-center justify-between gap-2 bg-navy-800 pl-4 pr-2 lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/logo.svg" alt="" className="h-8 w-8 shrink-0" />
            <span className="truncate font-display text-sm font-bold text-white">HeadStart Events</span>
            {campus && (
              <span className="max-w-[40vw] truncate rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: campus.accent }}>
                {campus.name}
              </span>
            )}
          </div>
          <button
            ref={toggleRef}
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="admin-mobile-nav"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        {/* Phone menu: slides over the page instead of pushing it down */}
        {open && (
          <div className="no-print fixed inset-0 top-14 z-30 lg:hidden">
            <button
              type="button" aria-label="Close navigation" tabIndex={-1}
              className="absolute inset-0 bg-navy-900/40 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
            />
            <div ref={drawerRef} id="admin-mobile-nav" className="relative max-h-full overflow-y-auto rounded-b-2xl bg-navy-800 pb-3 shadow-2xl">
              <div className="px-3 pt-3">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-navy-300">Campus</p>
                <CampusSwitcher variant="sidebar" />
              </div>
              {nav}
              <div className="mx-3 border-t border-white/10 pt-2">
                <p className="truncate px-3 pb-1 text-xs text-navy-200">{displayName || session?.user.email}</p>
                {signOutButton}
              </div>
            </div>
          </div>
        )}

        <main ref={mainRef} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
