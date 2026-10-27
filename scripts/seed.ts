// Fills the development database (data/kasuri.db) with sample staff and two months of attendance.
// Then run `npm run dev` to explore the app in a browser with realistic data.
import { monthDates } from '../shared/payroll.ts';
import { SCHEMA } from '../shared/schema.ts';
import { openDevDb } from './dev-sql-bridge.ts';

const db = await openDevDb();
for (const stmt of SCHEMA) db.exec(stmt);

const count = (db.prepare('SELECT COUNT(*) AS n FROM employees').get() as { n: number }).n;
if (count > 0) {
  console.log('Database already has staff – not adding demo data.');
  process.exit(0);
}

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const months = [-1, 0].map((d) => {
  const x = new Date(now.getFullYear(), now.getMonth() + d, 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
});
const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const staff = [
  { name: 'Ramesh Kumar', role: 'Head Cook', salary: 28000, leaves: 2, ot: 150, phone: '98100 11111' },
  { name: 'Sunita Devi', role: 'Cook', salary: 18000, leaves: 2, ot: 100, phone: '98100 22222' },
  { name: 'Amit Singh', role: 'Waiter', salary: 14000, leaves: 3, ot: 80, phone: '98100 33333' },
  { name: 'Pooja Sharma', role: 'Cashier', salary: 16000, leaves: 2, ot: 0, phone: '98100 44444' },
  { name: 'Mohd. Salim', role: 'Helper', salary: 11000, leaves: 4, ot: 60, phone: '98100 55555' },
  { name: 'Deepak Yadav', role: 'Cleaner', salary: 10000, leaves: 4, ot: 0, phone: '98100 66666' },
];

// Deterministic pseudo-random so the demo looks the same every time.
let seed = 42;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

db.exec('BEGIN');
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('restaurant_name', ?)").run(JSON.stringify('Kasuri Dhaba (Demo)'));
const insertEmp = db.prepare(
  'INSERT INTO employees (name, phone, role, monthly_salary, allowed_leaves, overtime_rate, join_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const insertAtt = db.prepare('INSERT INTO attendance (employee_id, date, status, overtime_hours) VALUES (?, ?, ?, ?)');
const insertAdj = db.prepare('INSERT INTO adjustments (employee_id, type, amount, date, note) VALUES (?, ?, ?, ?, ?)');

staff.forEach((s, i) => {
  const id = Number(insertEmp.run(s.name, s.phone, s.role, s.salary, s.leaves, s.ot, '2024-04-01').lastInsertRowid);
  for (const m of months) {
    for (const d of monthDates(m)) {
      if (d > todayStr) break;
      const r = rand();
      if (r < 0.06 + i * 0.01) insertAtt.run(id, d, 'A', 0);
      else if (r < 0.09 + i * 0.01) insertAtt.run(id, d, 'H', 0);
      else if (s.ot && r > 0.93) insertAtt.run(id, d, 'P', 2);
    }
  }
  if (i % 2 === 0) insertAdj.run(id, 'advance', 2000 + i * 500, `${months[1]}-02`, 'Family function');
});
insertAdj.run(1, 'bonus', 1500, `${months[0]}-25`, 'Festival bonus');
db.exec('COMMIT');

console.log(`Added ${staff.length} demo staff with attendance for ${months.join(' and ')}.`);
