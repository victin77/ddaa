import { Pool, PoolClient, types } from 'pg';
import bcrypt from 'bcryptjs';

types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(1082, (v) => v);

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não definido. Configure em server/.env');
}

const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

interface RunResult {
  rowCount: number;
  rows: any[];
}

export interface DbApi {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  queryAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryRun(sql: string, params?: any[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
}

function makeApi(exec: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>): DbApi {
  return {
    async queryOne(sql, params = []) {
      const r = await exec(sql, params);
      return r.rows[0];
    },
    async queryAll(sql, params = []) {
      const r = await exec(sql, params);
      return r.rows;
    },
    async queryRun(sql, params = []) {
      const r = await exec(sql, params);
      return { rowCount: r.rowCount ?? 0, rows: r.rows };
    },
    async exec(sql) {
      await exec(sql);
    },
  };
}

export const db: DbApi = makeApi((sql, params) => pool.query(sql, params));

export async function tx<T>(fn: (txDb: DbApi, client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txDb = makeApi((sql, params) => client.query(sql, params));
    const result = await fn(txDb, client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS consultants (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    monthly_target DOUBLE PRECISION NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','consultant')),
    consultant_id INTEGER REFERENCES consultants(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    consultant_id INTEGER NOT NULL REFERENCES consultants(id) ON DELETE CASCADE,
    consultant_name TEXT NOT NULL,
    client_number TEXT,
    client_name TEXT NOT NULL,
    product TEXT NOT NULL,
    sale_date DATE NOT NULL,
    insurance INTEGER NOT NULL DEFAULT 0,
    base_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    quotas INTEGER NOT NULL DEFAULT 1,
    unit_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    commission_percentage DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    total_commission DOUBLE PRECISION NOT NULL DEFAULT 0,
    group_quota TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$;

  DROP TRIGGER IF EXISTS trg_sales_updated ON sales;
  CREATE TRIGGER trg_sales_updated BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

  CREATE TABLE IF NOT EXISTS installments (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','pending','overdue')),
    bill_overdue INTEGER NOT NULL DEFAULT 0,
    paid_date DATE
  );

  CREATE TABLE IF NOT EXISTS sale_quotas (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    value DOUBLE PRECISION NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sales_consultant ON sales(consultant_id);
  CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
  CREATE INDEX IF NOT EXISTS idx_installments_sale ON installments(sale_id);
  CREATE INDEX IF NOT EXISTS idx_quotas_sale ON sale_quotas(sale_id);
`;

export async function initDb(): Promise<void> {
  await pool.query(SCHEMA_SQL);

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  const existsAdmin = await db.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE username = $1',
    [adminUsername]
  );
  if (!existsAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    await db.queryRun(
      'INSERT INTO users (username, password_hash, role, consultant_id) VALUES ($1,$2,$3,$4)',
      [adminUsername, hash, 'admin', null]
    );
    console.log(`[db] admin user created: ${adminUsername}`);
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
