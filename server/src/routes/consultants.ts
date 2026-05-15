import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../middleware';
import { ConsultantRow } from '../types';
import { hashPassword, resolveConsultantPassword } from '../auth';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, u.username AS login_username
       FROM consultants c
       LEFT JOIN users u ON u.consultant_id = c.id
       ORDER BY c.name COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, email, active = 1, monthly_target = 0 } = req.body as {
    name?: string;
    email?: string;
    active?: number;
    monthly_target?: number;
  };
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db
    .prepare('INSERT INTO consultants (name,email,active,monthly_target) VALUES (?,?,?,?)')
    .run(name.trim(), email || null, active ? 1 : 0, Number(monthly_target) || 0);
  const row = db
    .prepare('SELECT * FROM consultants WHERE id = ?')
    .get(info.lastInsertRowid) as ConsultantRow;
  res.json(row);
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { name, email, active, monthly_target } = req.body as {
    name?: string;
    email?: string;
    active?: number;
    monthly_target?: number;
  };
  const existing = db.prepare('SELECT * FROM consultants WHERE id=?').get(id) as
    | ConsultantRow
    | undefined;
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare(
    'UPDATE consultants SET name=?, email=?, active=?, monthly_target=? WHERE id=?'
  ).run(
    name ?? existing.name,
    email ?? existing.email,
    active === undefined ? existing.active : active ? 1 : 0,
    monthly_target === undefined ? existing.monthly_target : Number(monthly_target) || 0,
    id
  );
  if (name && name !== existing.name) {
    db.prepare('UPDATE sales SET consultant_name=? WHERE consultant_id=?').run(name, id);
  }
  res.json(db.prepare('SELECT * FROM consultants WHERE id=?').get(id));
});

router.post('/:id/create-login', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { username: rawUsername, password: rawPassword } = req.body as {
    username?: string;
    password?: string;
  };
  const consultant = db.prepare('SELECT * FROM consultants WHERE id=?').get(id) as
    | ConsultantRow
    | undefined;
  if (!consultant) return res.status(404).json({ error: 'consultant not found' });

  const username = (rawUsername || consultant.name.toLowerCase().replace(/\s+/g, '.')).trim();
  const password = rawPassword || resolveConsultantPassword(username, id);
  const hash = hashPassword(password);

  const existing = db.prepare('SELECT * FROM users WHERE consultant_id=?').get(id) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare('UPDATE users SET username=?, password_hash=? WHERE id=?').run(
      username,
      hash,
      existing.id
    );
  } else {
    db.prepare(
      'INSERT INTO users (username,password_hash,role,consultant_id) VALUES (?,?,?,?)'
    ).run(username, hash, 'consultant', id);
  }

  res.json({ username, password });
});

router.delete('/:id/login', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM users WHERE consultant_id=?').run(id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM consultants WHERE id=?').get(id) as
    | { id: number }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'not found' });
  const salesCount = (
    db.prepare('SELECT COUNT(*) AS c FROM sales WHERE consultant_id=?').get(id) as { c: number }
  ).c;
  db.prepare('DELETE FROM users WHERE consultant_id=?').run(id);
  db.prepare('DELETE FROM consultants WHERE id=?').run(id);
  res.json({ ok: true, salesRemoved: salesCount });
});

export default router;
