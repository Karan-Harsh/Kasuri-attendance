// Database schema, applied every time the app starts (all statements are idempotent).
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS employees (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    phone          TEXT NOT NULL DEFAULT '',
    role           TEXT NOT NULL DEFAULT '',
    monthly_salary REAL NOT NULL,
    allowed_leaves REAL NOT NULL DEFAULT 0,
    overtime_rate  REAL NOT NULL DEFAULT 0,
    join_date      TEXT NOT NULL,
    active         INTEGER NOT NULL DEFAULT 1,
    notes          TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS attendance (
    employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date           TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('P','A','H','L','O')),
    check_in       TEXT,
    check_out      TEXT,
    overtime_hours REAL NOT NULL DEFAULT 0,
    note           TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (employee_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS adjustments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('advance','bonus','deduction')),
    amount      REAL NOT NULL,
    date        TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    month       TEXT NOT NULL,
    amount      REAL NOT NULL,
    paid_on     TEXT NOT NULL,
    method      TEXT NOT NULL DEFAULT 'Cash',
    note        TEXT NOT NULL DEFAULT '',
    snapshot    TEXT NOT NULL,
    UNIQUE (employee_id, month)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)`,
  `CREATE INDEX IF NOT EXISTS idx_adjustments_date ON adjustments(date)`,
];

/** Columns of each table, in the order they are backed up and restored. */
export const TABLE_COLUMNS = {
  settings: ['key', 'value'],
  employees: ['id', 'name', 'phone', 'role', 'monthly_salary', 'allowed_leaves', 'overtime_rate', 'join_date', 'active', 'notes'],
  attendance: ['employee_id', 'date', 'status', 'check_in', 'check_out', 'overtime_hours', 'note'],
  adjustments: ['id', 'employee_id', 'type', 'amount', 'date', 'note'],
  payments: ['id', 'employee_id', 'month', 'amount', 'paid_on', 'method', 'note', 'snapshot'],
} as const;

export type TableName = keyof typeof TABLE_COLUMNS;
export const TABLES = Object.keys(TABLE_COLUMNS) as TableName[];
