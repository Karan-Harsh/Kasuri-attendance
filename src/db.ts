import { SCHEMA } from '../shared/schema.ts';

/** True when running inside the Tauri desktop app (as opposed to `npm run dev` in a browser). */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Sql {
  select<T>(query: string, params?: unknown[]): Promise<T[]>;
  execute(query: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

/** In the browser during development, queries go to a small SQLite bridge served by Vite (see scripts/dev-sql-bridge.ts). */
const devBridge: Sql = {
  select: (query, params) => bridge('select', query, params),
  execute: (query, params) => bridge('execute', query, params),
};

async function bridge<T>(mode: 'select' | 'execute', query: string, params: unknown[] = []): Promise<T> {
  const res = await fetch('/__sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, query, params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

async function open(): Promise<Sql> {
  let db: Sql = devBridge;
  if (isDesktop) {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    // Stored in the app's data folder, e.g. C:\Users\<name>\AppData\Roaming\in.kasuri.desktop\kasuri.db
    const conn = await Database.load('sqlite:kasuri.db');
    db = { select: (q, p) => conn.select(q, p), execute: (q, p) => conn.execute(q, p) };
  }
  for (const stmt of SCHEMA) await db.execute(stmt);
  return db;
}

let ready: Promise<Sql> | null = null;

export function sql(): Promise<Sql> {
  ready ??= open().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/UNIQUE constraint failed: payments/.test(msg)) return 'Already marked as paid';
  return msg;
}
