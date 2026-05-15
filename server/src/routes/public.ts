import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/consultants', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, u.username
       FROM consultants c
       LEFT JOIN users u ON u.consultant_id = c.id
       WHERE c.active = 1
       ORDER BY c.name COLLATE NOCASE`
    )
    .all() as { id: number; name: string; username: string | null }[];
  res.json(rows);
});

export default router;
