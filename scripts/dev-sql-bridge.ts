// Development only: lets the app run in a normal browser (`npm run dev`) by executing its SQL
// against data/kasuri.db with Node's built-in SQLite. The desktop app uses the Tauri SQL plugin instead.
import type { Plugin } from 'vite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export function devSqlBridge(): Plugin {
  return {
    name: 'kasuri-dev-sql-bridge',
    apply: 'serve',
    async configureServer(server) {
      const db = await openDevDb();
      server.middlewares.use('/__sql', (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { mode, query, params = [] } = JSON.parse(body);
            const stmt = db.prepare(query);
            const args = params.map((p: unknown) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
            if (mode === 'select') {
              res.end(JSON.stringify(stmt.all(...args)));
            } else {
              const r = stmt.run(...args);
              res.end(JSON.stringify({ rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) }));
            }
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
      });
    },
  };
}

export async function openDevDb() {
  process.removeAllListeners('warning'); // silence "SQLite is experimental"
  const { DatabaseSync } = await import('node:sqlite');
  const dir = path.resolve(import.meta.dirname, '../data');
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'kasuri.db'));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return db;
}
