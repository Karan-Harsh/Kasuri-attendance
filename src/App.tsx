import { CalendarCheck, CalendarDays, HandCoins, LayoutDashboard, Settings as SettingsIcon, Users, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import type { Settings } from '../shared/types.ts';
import { api } from './api.ts';
import { autoBackupIfDue } from './desktop.ts';
import DialogHost from './components/DialogHost.tsx';
import { cx } from './components/ui.tsx';
import { SettingsContext } from './format.ts';
import AdvancesPage from './pages/Advances.tsx';
import DashboardPage from './pages/Dashboard.tsx';
import EmployeeDetailPage from './pages/EmployeeDetail.tsx';
import EmployeesPage from './pages/Employees.tsx';
import PayrollPage from './pages/Payroll.tsx';
import PayslipPage from './pages/Payslip.tsx';
import SettingsPage from './pages/Settings.tsx';
import TimesheetPage from './pages/Timesheet.tsx';
import TodayPage from './pages/Today.tsx';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/timesheet', label: 'Timesheet', icon: CalendarDays },
  { to: '/payroll', label: 'Salary', icon: Wallet },
  { to: '/advances', label: 'Advances', icon: HandCoins },
  { to: '/employees', label: 'Staff', icon: Users },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const refresh = useCallback(() => {
    api
      .settings()
      .then((s) => {
        setSettings(s);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(refresh, [refresh]);

  // Daily backup: check at start-up and every hour in case the app stays open overnight.
  const backupDir = settings?.backup_dir ?? '';
  useEffect(() => {
    if (!backupDir) return;
    autoBackupIfDue(backupDir);
    const timer = setInterval(() => autoBackupIfDue(backupDir), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [backupDir]);

  if (!settings) {
    return failed ? (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="font-semibold">Could not open the Kasuri database.</p>
        <p className="mt-1 text-stone-500">Close and reopen the app. If this keeps happening, restore from a backup.</p>
        <button className="mt-4 cursor-pointer rounded-lg bg-brand-600 px-4 py-2 font-medium text-white" onClick={refresh}>
          Try again
        </button>
      </div>
    ) : null;
  }

  return (
    <SettingsContext.Provider value={{ settings, refresh }}>
      <DialogHost />
      <div className="min-h-screen lg:flex">
        {/* Desktop sidebar */}
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex">
          <div className="px-5 py-6">
            <div className="text-xl font-bold text-brand-700">🍛 Kasuri</div>
            <div className="mt-0.5 truncate text-sm text-stone-500">{settings.restaurant_name}</div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors',
                    isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100',
                  )
                }
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="font-bold text-brand-700">🍛 Kasuri</div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-stone-500">{settings.restaurant_name}</span>
            <NavLink to="/settings" className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Settings">
              <SettingsIcon size={20} />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-10">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/attendance" element={<TodayPage />} />
            <Route path="/timesheet" element={<TimesheetPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/payroll/:month/:employeeId" element={<PayslipPage />} />
            <Route path="/advances" element={<AdvancesPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/employees/:id" element={<EmployeeDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {/* Mobile bottom nav */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAV.filter((n) => n.to !== '/settings').map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-700' : 'text-stone-500')
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </SettingsContext.Provider>
  );
}
