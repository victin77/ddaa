import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/consultants', async (_req, res) => {
  const rows = await db.queryAll<{ id: number; name: string; username: string | null }>(
    `SELECT c.id, c.name, u.username
       FROM consultants c
       LEFT JOIN users u ON u.consultant_id = c.id
       WHERE c.active = 1
       ORDER BY LOWER(c.name)`
  );
  res.json(rows);
});

export default router;
