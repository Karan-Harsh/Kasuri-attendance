import { AlertCircle, CalendarCheck, HandCoins, UserPlus, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { STATUS_LABELS } from '../../shared/types.ts';
import { api, useLoad } from '../api.ts';
import { Avatar, Badge, Card, ErrorBox, Loading, Stat } from '../components/ui.tsx';
import { dateLabel, monthLabel, shiftMonth, thisMonth, today, useMoney, useSettings } from '../format.ts';

export default function DashboardPage() {
  const money = useMoney();
  const { settings } = useSettings();
  const month = thisMonth();
  const lastMonth = shiftMonth(month, -1);
  const { data, error } = useLoad(async () => {
    const [employees, todayRecords, payroll, lastPayroll, adjustments] = await Promise.all([
      api.employees(),
      api.attendanceForDate(today()),
      api.payroll(month),
      api.payroll(lastMonth),
      api.adjustmentsForMonth(month),
    ]);
    return { employees, todayRecords, payroll, lastPayroll, adjustments };
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const active = data.employees.filter((e) => e.active);
  const away = data.todayRecords.filter((r) => r.status !== 'P' && active.some((e) => e.id === r.employee_id));
  const nameOf = (id: number) => data.employees.find((e) => e.id === id)?.name ?? '';
  const unpaidLast = data.lastPayroll.filter((p) => !p.payment);
  const advances = data.adjustments.filter((a) => a.type === 'advance').reduce((s, a) => s + a.amount, 0);
  const overLimit = data.payroll.filter((p) => p.line.extra_leaves > 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (data.employees.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="text-5xl">🍛</div>
        <h1 className="mt-4 text-2xl font-bold">Welcome to Kasuri</h1>
        <p className="mt-2 text-stone-500">Track your staff's attendance and calculate salaries automatically. Start in two steps:</p>
        <div className="mt-8 space-y-3 text-left">
          <Link to="/settings" className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-500">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">1</span>
            <span><span className="font-semibold">Set your restaurant name</span><span className="block text-sm text-stone-500">and how leave deductions should work</span></span>
          </Link>
          <Link to="/employees" className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4 hover:border-brand-500">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">2</span>
            <span><span className="font-semibold">Add your staff</span><span className="block text-sm text-stone-500">with their salary and allowed leaves per month</span></span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{greeting} 👋</h1>
        <p className="text-stone-500">{settings.restaurant_name} · {dateLabel(today(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAction to="/attendance" icon={<CalendarCheck />} label="Mark today’s attendance" />
        <QuickAction to="/advances" icon={<HandCoins />} label="Give an advance" />
        <QuickAction to="/payroll" icon={<Wallet />} label="Pay salaries" />
        <QuickAction to="/employees" icon={<UserPlus />} label="Add / view staff" />
      </div>

      {unpaidLast.length > 0 && (
        <Link to="/payroll" className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 hover:bg-amber-100">
          <AlertCircle size={20} className="shrink-0" />
          <span>
            <b>{unpaidLast.length}</b> {unpaidLast.length === 1 ? 'person has' : 'people have'} not been paid for {monthLabel(lastMonth)} yet
            ({money(unpaidLast.reduce((s, p) => s + p.line.net_pay, 0))}). Switch to that month on the Salary page.
          </span>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Staff working" value={active.length} icon={<Users size={18} />} />
        <Stat label="Away today" value={away.length} hint={`${active.length - away.length} present`} icon={<CalendarCheck size={18} />} />
        <Stat label={`Salary for ${monthLabel(month).split(' ')[0]}`} value={money(data.payroll.reduce((s, p) => s + p.line.net_pay, 0))} hint="estimate so far" icon={<Wallet size={18} />} />
        <Stat label="Advances this month" value={money(advances)} icon={<HandCoins size={18} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Away today</h2>
          {away.length === 0 ? (
            <p className="text-stone-500">Everyone is present. 🎉</p>
          ) : (
            <div className="space-y-2">
              {away.map((r) => (
                <div key={r.employee_id} className="flex items-center gap-3">
                  <Avatar name={nameOf(r.employee_id)} id={r.employee_id} size="sm" />
                  <span className="flex-1 font-medium">{nameOf(r.employee_id)}</span>
                  <Badge tone={r.status === 'A' ? 'red' : r.status === 'H' ? 'amber' : 'blue'}>{STATUS_LABELS[r.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Over leave limit this month</h2>
          {overLimit.length === 0 ? (
            <p className="text-stone-500">Nobody has crossed their allowed leaves.</p>
          ) : (
            <div className="space-y-2">
              {overLimit.map(({ line: l }) => (
                <Link key={l.employee_id} to={`/employees/${l.employee_id}`} className="flex items-center gap-3 hover:text-brand-700">
                  <Avatar name={l.name} id={l.employee_id} size="sm" />
                  <span className="flex-1 font-medium">{l.name}</span>
                  <span className="text-sm text-stone-500">{l.leaves_taken} / {l.allowed_leaves}</span>
                  <Badge tone="red">−{money(l.leave_deduction)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-start gap-3 rounded-xl bg-brand-600 p-4 font-semibold text-white shadow-sm transition hover:bg-brand-700">
      {icon}
      {label}
    </Link>
  );
}
