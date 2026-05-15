import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../middleware';
import { ConsultantRow } from '../types';
import { hashPassword, resolveConsultantPassword } from '../auth';

const router = Router();

router.get('/', requireAuth, async (_req, res) => {
  const rows = await db.queryAll(
    `SELECT c.*, u.username AS login_username
       FROM consultants c
       LEFT JOIN users u ON u.consultant_id = c.id
       ORDER BY LOWER(c.name)`
  );
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { name, email, active = 1, monthly_target = 0 } = req.body as {
    name?: string;
    email?: string;
    active?: number;
    monthly_target?: number;
  };
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = await db.queryRun(
    'INSERT INTO consultants (name,email,active,monthly_target) VALUES ($1,$2,$3,$4) RETURNING id',
    [name.trim(), email || null, active ? 1 : 0, Number(monthly_target) || 0]
  );
  const row = await db.queryOne<ConsultantRow>(
    'SELECT * FROM consultants WHERE id = $1',
    [r.rows[0].id]
  );
  res.json(row);
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, active, monthly_target } = req.body as {
    name?: string;
    email?: string;
    active?: number;
    monthly_target?: number;
  };
  const existing = await db.queryOne<ConsultantRow>(
    'SELECT * FROM consultants WHERE id=$1',
    [id]
  );
  if (!existing) return res.status(404).json({ error: 'not found' });
  await db.queryRun(
    'UPDATE consultants SET name=$1, email=$2, active=$3, monthly_target=$4 WHERE id=$5',
    [
      name ?? existing.name,
      email ?? existing.email,
      active === undefined ? existing.active : active ? 1 : 0,
      monthly_target === undefined ? existing.monthly_target : Number(monthly_target) || 0,
      id,
    ]
  );
  if (name && name !== existing.name) {
    await db.queryRun(
      'UPDATE sales SET consultant_name=$1 WHERE consultant_id=$2',
      [name, id]
    );
  }
  const updated = await db.queryOne('SELECT * FROM consultants WHERE id=$1', [id]);
  res.json(updated);
});

router.post('/:id/create-login', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { username: rawUsername, password: rawPassword } = req.body as {
    username?: string;
    password?: string;
  };
  const consultant = await db.queryOne<ConsultantRow>(
    'SELECT * FROM consultants WHERE id=$1',
    [id]
  );
  if (!consultant) return res.status(404).json({ error: 'consultant not found' });

  const username = (rawUsername || consultant.name.toLowerCase().replace(/\s+/g, '.')).trim();
  const password = rawPassword || resolveConsultantPassword(username, id);
  const hash = hashPassword(password);

  const existing = await db.queryOne<{ id: number }>(
    'SELECT id FROM users WHERE consultant_id=$1',
    [id]
  );

  if (existing) {
    await db.queryRun(
      'UPDATE users SET username=$1, password_hash=$2 WHERE id=$3',
      [username, hash, existing.id]
    );
  } else {
    await db.queryRun(
      'INSERT INTO users (username,password_hash,role,consultant_id) VALUES ($1,$2,$3,$4)',
      [username, hash, 'consultant', id]
    );
  }

  res.json({ username, password });
});

router.delete('/:id/login', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.queryRun('DELETE FROM users WHERE consultant_id=$1', [id]);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const existing = await db.queryOne<{ id: number }>(
    'SELECT id FROM consultants WHERE id=$1',
    [id]
  );
  if (!existing) return res.status(404).json({ error: 'not found' });
  const countRow = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM sales WHERE consultant_id=$1',
    [id]
  );
  const salesCount = countRow?.c ?? 0;
  await db.queryRun('DELETE FROM users WHERE consultant_id=$1', [id]);
  await db.queryRun('DELETE FROM consultants WHERE id=$1', [id]);
  res.json({ ok: true, salesRemoved: salesCount });
});

export default router;
