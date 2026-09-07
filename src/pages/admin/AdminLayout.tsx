import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
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
  const { session, signOut } = useAuth();
  const { campus } = useCampus();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Admin navigation">
      {navItems.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <a className="skip-link" href="#admin-content">Skip to main content</a>
      {campus && (
        <div className="fixed inset-x-0 top-0 z-40 h-1" style={{ background: campus.accent }} aria-hidden="true" />
      )}
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-navy-800 lg:flex">
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
        {nav}
        <div className="border-t border-white/10 p-3">
          <p className="truncate px-3 pb-2 text-xs text-navy-200">{session?.user.email}</p>
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-navy-100 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-5 w-5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar and drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-navy-800 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-8 w-8" />
            <span className="font-display text-sm font-bold text-white">HeadStart Events</span>
            {campus && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: campus.accent }}>
                {campus.name}
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open} aria-controls="mobile-navigation"
            className="rounded-lg p-2 text-white hover:bg-white/10"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open && (
          <div id="mobile-navigation" className="no-print z-20 bg-navy-800 pb-3 lg:hidden">
            <div className="px-3 pt-3">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-navy-300">Campus</p>
              <CampusSwitcher variant="sidebar" />
            </div>
            {nav}
            <button
              onClick={() => void signOut()}
              className="mx-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-navy-100 hover:bg-white/5"
            >
              <LogOut className="h-5 w-5" /> Sign out
            </button>
          </div>
        )}

        <main id="admin-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
