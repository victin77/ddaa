import { Router } from 'express';
import { db } from '../db';
import {
  clearSessionCookie,
  setSessionCookie,
  signToken,
  verifyPassword,
  hashPassword,
  resolveConsultantPassword,
} from '../auth';
import { UserRow, AuthUser, ConsultantRow } from '../types';
import { requireAuth } from '../middleware';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) return res.status(400).json({ error: 'missing credentials' });

  let userRow = await db.queryOne<UserRow>(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );

  // Auto-provision login pra consultor se houver senha em env
  if (!userRow) {
    const consultant = await db.queryOne<ConsultantRow>(
      'SELECT * FROM consultants WHERE LOWER(name)=LOWER($1) OR LOWER(name)=LOWER($2)',
      [username, username.replace(/\s+/g, ' ')]
    );
    if (consultant) {
      const expected = resolveConsultantPassword(username, consultant.id);
      if (expected === password) {
        const hash = hashPassword(password);
        const r = await db.queryRun(
          'INSERT INTO users (username, password_hash, role, consultant_id) VALUES ($1,$2,$3,$4) RETURNING id',
          [username, hash, 'consultant', consultant.id]
        );
        userRow = {
          id: r.rows[0].id,
          username,
          password_hash: hash,
          role: 'consultant',
          consultant_id: consultant.id,
        };
      }
    }
  }

  if (!userRow) return res.status(401).json({ error: 'invalid credentials' });
  if (!verifyPassword(password, userRow.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  const auth: AuthUser = {
    id: userRow.id,
    username: userRow.username,
    role: userRow.role,
    consultant_id: userRow.consultant_id,
  };
  const token = signToken(auth);
  setSessionCookie(res, token);
  res.json({ user: auth });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
