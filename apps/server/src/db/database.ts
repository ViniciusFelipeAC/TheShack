import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Única dependência direta do SQLite no projeto. Os repositórios em db/*.ts usam só
 * `Db`, `tx` e `afterCommit`; trocar de banco é reimplementar esta pasta.
 */
export type Db = DatabaseSync;

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
const state = new WeakMap<Db, { depth: number; pending: Array<() => void> }>();

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  state.set(db, { depth: 0, pending: [] });
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => String(r.name)));
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    tx(db, () => {
      db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    });
  }
}

/** Transação reentrante: chamadas aninhadas participam da transação externa. */
export function tx<T>(db: Db, fn: () => T): T {
  const s = state.get(db)!;
  if (s.depth > 0) {
    s.depth++;
    try { return fn(); } finally { s.depth--; }
  }
  db.exec('BEGIN IMMEDIATE');
  s.depth = 1;
  try {
    const result = fn();
    db.exec('COMMIT');
    s.depth = 0;
    const pending = s.pending.splice(0);
    for (const run of pending) run();
    return result;
  } catch (err) {
    s.depth = 0;
    s.pending.length = 0;
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Roda `fn` depois do commit da transação atual, ou na hora se não houver transação. */
export function afterCommit(db: Db, fn: () => void): void {
  const s = state.get(db)!;
  if (s.depth > 0) s.pending.push(fn);
  else fn();
}

export const now = (): string => new Date().toISOString();
export const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
export const parseJson = <T>(v: unknown): T | null => (v === null || v === undefined ? null : (JSON.parse(String(v)) as T));
export const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
