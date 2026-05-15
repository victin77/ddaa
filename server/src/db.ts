import { DatabaseSync, StatementSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const raw = new DatabaseSync(path.join(dataDir, 'data.sqlite'));
raw.exec('PRAGMA journal_mode = WAL;');
raw.exec('PRAGMA foreign_keys = ON;');

function normalizeValue(v: any): any {
  if (typeof v === 'bigint') return Number(v);
  return v;
}

function normalizeRow<T = any>(row: any): T | undefined {
  if (!row) return row;
  const out: any = {};
  for (const k of Object.keys(row)) out[k] = normalizeValue(row[k]);
  return out as T;
}

interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

interface Stmt {
  get<T = any>(...params: any[]): T | undefined;
  all<T = any>(...params: any[]): T[];
  run(...params: any[]): RunResult;
}

function wrap(s: StatementSync): Stmt {
  return {
    get(...params: any[]) {
      const row = s.get(...(params as any));
      return normalizeRow(row);
    },
    all(...params: any[]) {
      const rows = s.all(...(params as any));
      return rows.map((r: any) => normalizeRow(r)!);
    },
    run(...params: any[]) {
      const r = s.run(...(params as any));
      return {
        changes: Number(r.changes),
        lastInsertRowid: Number(r.lastInsertRowid),
      };
    },
  };
}

export const db = {
  exec: (sql: string) => raw.exec(sql),
  prepare: (sql: string) => wrap(raw.prepare(sql)),
  close: () => raw.close(),
};

db.exec(`
  CREATE TABLE IF NOT EXISTS consultants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','consultant')),
    consultant_id INTEGER,
    FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultant_id INTEGER NOT NULL,
    consultant_name TEXT NOT NULL,
    client_number TEXT,
    client_name TEXT NOT NULL,
    product TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    insurance INTEGER NOT NULL DEFAULT 0,
    base_value REAL NOT NULL DEFAULT 0,
    quotas INTEGER NOT NULL DEFAULT 1,
    unit_value REAL NOT NULL DEFAULT 0,
    commission_percentage REAL NOT NULL DEFAULT 0.8,
    total_commission REAL NOT NULL DEFAULT 0,
    group_quota TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (consultant_id) REFERENCES consultants(id) ON DELETE CASCADE
  );

  CREATE TRIGGER IF NOT EXISTS trg_sales_updated
  AFTER UPDATE ON sales FOR EACH ROW BEGIN
    UPDATE sales SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

  CREATE TABLE IF NOT EXISTS installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    value REAL NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','pending','overdue')),
    bill_overdue INTEGER NOT NULL DEFAULT 0,
    paid_date TEXT,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sale_quotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    value REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sales_consultant ON sales(consultant_id);
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
  CREATE INDEX IF NOT EXISTS idx_installments_sale ON installments(sale_id);
  CREATE INDEX IF NOT EXISTS idx_quotas_sale ON sale_quotas(sale_id);
`);

// Migrations (idempotent)
function ensureColumn(table: string, column: string, definition: string) {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('consultants', 'monthly_target', 'REAL NOT NULL DEFAULT 0');
ensureColumn('sales', 'group_quota', 'TEXT');

// Seed admin
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
const existsAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUsername);
if (!existsAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, role, consultant_id) VALUES (?,?,?,?)'
  ).run(adminUsername, hash, 'admin', null);
  console.log(`[db] admin user created: ${adminUsername}`);
}
