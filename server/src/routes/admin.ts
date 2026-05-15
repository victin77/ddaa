import { Router } from 'express';
import { db, tx } from '../db';
import { requireAuth, requireAdmin } from '../middleware';

const router = Router();

router.post('/wipe-sales', requireAuth, requireAdmin, async (req, res) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== 'APAGAR TODAS AS VENDAS') {
    return res.status(400).json({ error: 'confirmação incorreta' });
  }
  const before = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM sales'
  );
  await tx(async (t) => {
    await t.exec('DELETE FROM installments');
    await t.exec('DELETE FROM sale_quotas');
    await t.exec('DELETE FROM sales');
  });
  res.json({ ok: true, salesRemoved: before?.c ?? 0 });
});

router.post('/wipe-all', requireAuth, requireAdmin, async (req, res) => {
  const { confirm } = req.body as { confirm?: string };
  if (confirm !== 'ZERAR SISTEMA') {
    return res.status(400).json({ error: 'confirmação incorreta' });
  }
  const sales = await db.queryOne<{ c: number }>('SELECT COUNT(*)::int AS c FROM sales');
  const consultants = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*)::int AS c FROM consultants'
  );
  await tx(async (t) => {
    await t.exec('DELETE FROM installments');
    await t.exec('DELETE FROM sale_quotas');
    await t.exec('DELETE FROM sales');
    await t.exec("DELETE FROM users WHERE role = 'consultant'");
    await t.exec('DELETE FROM consultants');
  });
  res.json({ ok: true, sales: sales?.c ?? 0, consultants: consultants?.c ?? 0 });
});

export default router;
