import { Router } from 'express';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../middleware';

const router = Router();

router.post('/wipe-sales', requireAuth, requireAdmin, (req, res) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== 'APAGAR TODAS AS VENDAS') {
    return res.status(400).json({ error: 'confirmação incorreta' });
  }
  const salesBefore = (
    db.prepare('SELECT COUNT(*) AS c FROM sales').get() as { c: number }
  ).c;
  db.exec('DELETE FROM installments; DELETE FROM sale_quotas; DELETE FROM sales;');
  res.json({ ok: true, salesRemoved: salesBefore });
});

router.post('/wipe-all', requireAuth, requireAdmin, (req, res) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== 'ZERAR SISTEMA') {
    return res.status(400).json({ error: 'confirmação incorreta' });
  }
  const counts = {
    sales: (db.prepare('SELECT COUNT(*) AS c FROM sales').get() as { c: number }).c,
    consultants: (db.prepare('SELECT COUNT(*) AS c FROM consultants').get() as { c: number }).c,
  };
  db.exec(`
    DELETE FROM installments;
    DELETE FROM sale_quotas;
    DELETE FROM sales;
    DELETE FROM users WHERE role = 'consultant';
    DELETE FROM consultants;
  `);
  res.json({ ok: true, ...counts });
});

export default router;
