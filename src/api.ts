import { useCallback, useEffect, useState } from 'react';
import { calculatePayroll, monthDates } from '../shared/payroll.ts';
import { TABLE_COLUMNS, TABLES } from '../shared/schema.ts';
import type { Adjustment, AttendanceRecord, AttendanceStatus, Employee, Payment, PayrollLine, Settings } from '../shared/types.ts';
import { errorMessage, sql } from './db.ts';

export interface PayrollEntry {
  line: PayrollLine;
  live: PayrollLine;
  payment: Payment | null;
}

export const DEFAULT_SETTINGS: Settings = {
  restaurant_name: 'My Restaurant',
  currency_symbol: '₹',
  per_day_basis: 'calendar',
  pay_unused_leaves: false,
  backup_dir: '',
};

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function num(v: unknown, field: string, { min = 0 } = {}): number {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n < min) throw new Error(`${field} must be a number of at least ${min}`);
  return n;
}

async function select<T>(query: string, params: unknown[] = []) {
  return (await sql()).select<T>(query, params);
}

async function execute(query: string, params: unknown[] = []) {
  try {
    return await (await sql()).execute(query, params);
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

// ---------- settings ----------

async function getSetting<T>(key: string): Promise<T | undefined> {
  const rows = await select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return rows[0] ? JSON.parse(rows[0].value) : undefined;
}

async function setSetting(key: string, value: unknown) {
  await execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    JSON.stringify(value),
  ]);
}

async function getSettings(): Promise<Settings> {
  const rows = await select<{ key: string; value: string }>('SELECT key, value FROM settings');
  const settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in DEFAULT_SETTINGS) Object.assign(settings, { [r.key]: JSON.parse(r.value) });
  return settings;
}

// ---------- employees ----------

function employeeFromInput(body: Partial<Employee>) {
  const name = str(body.name);
  if (!name) throw new Error('Name is required');
  if (!isDate(body.join_date)) throw new Error('Joining date is required');
  return [
    name,
    str(body.phone),
    str(body.role),
    num(body.monthly_salary, 'Monthly salary'),
    num(body.allowed_leaves ?? 0, 'Allowed leaves'),
    num(body.overtime_rate ?? 0, 'Overtime rate'),
    body.join_date,
    body.active === 0 ? 0 : 1,
    str(body.notes),
  ];
}

async function getEmployee(id: number) {
  const [emp] = await select<Employee>('SELECT * FROM employees WHERE id = ?', [id]);
  if (!emp) throw new Error('Employee not found');
  return emp;
}

// ---------- payroll ----------

function parsePayment(row: Payment & { snapshot: unknown }): Payment {
  return { ...row, snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot };
}

async function payrollFor(month: string): Promise<PayrollEntry[]> {
  const dates = monthDates(month);
  const [first, last] = [dates[0], dates[dates.length - 1]];
  const [settings, employees, attendance, adjustments, paymentRows] = await Promise.all([
    getSettings(),
    select<Employee>('SELECT * FROM employees WHERE join_date <= ? ORDER BY name COLLATE NOCASE', [last]),
    select<AttendanceRecord>('SELECT * FROM attendance WHERE date BETWEEN ? AND ?', [first, last]),
    select<Adjustment>('SELECT * FROM adjustments WHERE date BETWEEN ? AND ?', [first, last]),
    select<Payment>('SELECT * FROM payments WHERE month = ?', [month]),
  ]);
  const paidBy = new Map(paymentRows.map((p) => [p.employee_id, parsePayment(p)]));

  // Former staff are only shown if they have something recorded for this month.
  const relevant = employees.filter(
    (e) =>
      e.active ||
      paidBy.has(e.id) ||
      attendance.some((a) => a.employee_id === e.id) ||
      adjustments.some((a) => a.employee_id === e.id),
  );

  return relevant.map((e) => {
    const payment = paidBy.get(e.id) ?? null;
    const live = calculatePayroll(e, month, attendance, adjustments, settings);
    return { line: payment ? payment.snapshot : live, live, payment };
  });
}

// ---------- backup ----------

export interface BackupFile {
  app: 'kasuri';
  version: 1;
  exported_at: string;
  [table: string]: unknown;
}

async function backup(): Promise<BackupFile> {
  const dump: BackupFile = { app: 'kasuri', version: 1, exported_at: new Date().toISOString() };
  for (const t of TABLES) dump[t] = await select(`SELECT * FROM ${t}`);
  return dump;
}

async function restore(dump: BackupFile) {
  if (dump?.app !== 'kasuri') throw new Error('This is not a Kasuri backup file');
  for (const t of TABLES) if (!Array.isArray(dump[t])) throw new Error(`Backup file is missing ${t}`);

  for (const t of [...TABLES].reverse()) await execute(`DELETE FROM ${t}`);
  for (const t of TABLES) {
    const cols = TABLE_COLUMNS[t];
    const rows = dump[t] as Record<string, unknown>[];
    // Insert in chunks so large backups don't need thousands of separate queries.
    const perChunk = Math.floor(900 / cols.length);
    for (let i = 0; i < rows.length; i += perChunk) {
      const chunk = rows.slice(i, i + perChunk);
      const placeholders = chunk.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
      const values = chunk.flatMap((row) =>
        cols.map((c) => {
          const v = row[c];
          return v === undefined ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
        }),
      );
      await execute(`INSERT INTO ${t} (${cols.join(',')}) VALUES ${placeholders}`, values);
    }
  }
}

// ---------- public API used by the pages ----------

export const api = {
  settings: getSettings,
  async saveSettings(patch: Partial<Settings>) {
    for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS) await setSetting(k, v);
    return getSettings();
  },
  lastBackupDate: () => getSetting<string>('last_backup_date'),
  setLastBackupDate: (date: string) => setSetting('last_backup_date', date),

  employees: () => select<Employee>('SELECT * FROM employees ORDER BY active DESC, name COLLATE NOCASE'),
  employee: getEmployee,
  async createEmployee(e: Partial<Employee>) {
    const r = await execute(
      `INSERT INTO employees (name, phone, role, monthly_salary, allowed_leaves, overtime_rate, join_date, active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      employeeFromInput(e),
    );
    return getEmployee(Number(r.lastInsertId));
  },
  async updateEmployee(id: number, e: Partial<Employee>) {
    await execute(
      `UPDATE employees SET name=?, phone=?, role=?, monthly_salary=?, allowed_leaves=?, overtime_rate=?,
       join_date=?, active=?, notes=? WHERE id=?`,
      [...employeeFromInput(e), id],
    );
    return getEmployee(id);
  },
  async deleteEmployee(id: number) {
    for (const t of ['payments', 'adjustments', 'attendance']) await execute(`DELETE FROM ${t} WHERE employee_id = ?`, [id]);
    await execute('DELETE FROM employees WHERE id = ?', [id]);
  },

  attendanceForMonth: (month: string) => select<AttendanceRecord>("SELECT * FROM attendance WHERE date LIKE ? || '-%'", [month]),
  attendanceForDate: (date: string) => select<AttendanceRecord>('SELECT * FROM attendance WHERE date = ?', [date]),
  /** Saves attendance. A plain "present" with no times, overtime or note is deleted, since present is the default. */
  async saveAttendance(records: Partial<AttendanceRecord>[]) {
    for (const r of records) {
      if (!isDate(r.date)) throw new Error('Invalid date');
      if (!r.status || !['P', 'A', 'H', 'L', 'O'].includes(r.status)) throw new Error('Invalid status');
      const employeeId = num(r.employee_id, 'Employee', { min: 1 });
      const checkIn = r.check_in || null;
      const checkOut = r.check_out || null;
      const ot = num(r.overtime_hours ?? 0, 'Overtime hours');
      const note = str(r.note);
      if (r.status === 'P' && !checkIn && !checkOut && !ot && !note) {
        await execute('DELETE FROM attendance WHERE employee_id = ? AND date = ?', [employeeId, r.date]);
      } else {
        await execute(
          `INSERT INTO attendance (employee_id, date, status, check_in, check_out, overtime_hours, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(employee_id, date) DO UPDATE SET status=excluded.status, check_in=excluded.check_in,
             check_out=excluded.check_out, overtime_hours=excluded.overtime_hours, note=excluded.note`,
          [employeeId, r.date, r.status as AttendanceStatus, checkIn, checkOut, ot, note],
        );
      }
    }
  },

  adjustmentsForMonth: (month: string) =>
    select<Adjustment>("SELECT * FROM adjustments WHERE date LIKE ? || '-%' ORDER BY date DESC, id DESC", [month]),
  adjustmentsForEmployee: (id: number) =>
    select<Adjustment>('SELECT * FROM adjustments WHERE employee_id = ? ORDER BY date DESC, id DESC', [id]),
  async addAdjustment(a: Partial<Adjustment>) {
    if (!a.type || !['advance', 'bonus', 'deduction'].includes(a.type)) throw new Error('Invalid type');
    if (!isDate(a.date)) throw new Error('Date is required');
    const amount = num(a.amount, 'Amount');
    if (amount === 0) throw new Error('Amount must be more than 0');
    await execute('INSERT INTO adjustments (employee_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)', [
      num(a.employee_id, 'Staff member', { min: 1 }),
      a.type,
      amount,
      a.date,
      str(a.note),
    ]);
  },
  deleteAdjustment: async (id: number) => {
    await execute('DELETE FROM adjustments WHERE id = ?', [id]);
  },

  payroll: payrollFor,
  async pay(p: { employee_id: number; month: string; amount?: number; paid_on?: string; method?: string; note?: string }) {
    const entry = (await payrollFor(p.month)).find((e) => e.line.employee_id === p.employee_id);
    if (!entry) throw new Error('Employee not on payroll for this month');
    if (entry.payment) throw new Error('Already marked as paid');
    await execute('INSERT INTO payments (employee_id, month, amount, paid_on, method, note, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      p.employee_id,
      p.month,
      p.amount === undefined ? entry.live.net_pay : num(p.amount, 'Amount'),
      isDate(p.paid_on) ? p.paid_on : todayISO(),
      str(p.method) || 'Cash',
      str(p.note),
      JSON.stringify(entry.live),
    ]);
  },
  undoPayment: async (id: number) => {
    await execute('DELETE FROM payments WHERE id = ?', [id]);
  },
  paymentsForEmployee: async (id: number) =>
    (await select<Payment>('SELECT * FROM payments WHERE employee_id = ? ORDER BY month DESC', [id])).map(parsePayment),

  backup,
  restore,
};

/** Tiny data-loading hook: returns data, error, loading and a reload function. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps);

  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}
