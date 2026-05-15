import { Router } from 'express';
import dayjs from 'dayjs';
import { db } from '../db';
import { requireAuth } from '../middleware';
import { tierFor } from '../utils/tiers';

const router = Router();

router.get('/summary', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'admin';
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
  const prevMonthStart = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const prevMonthEnd = dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  // Para queries com WHERE consultant_id opcional, usamos um literal NULL e
  // o filtro só vale quando o consultant_id é passado.
  const cid = isAdmin ? null : req.user!.consultant_id;

  const salesToday = await db.queryOne<{ c: number; s: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(total_commission),0) s FROM sales
     WHERE ($1::int IS NULL OR consultant_id=$1) AND sale_date = $2`,
    [cid, today]
  );
  const salesWeek = await db.queryOne<{ c: number; s: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(base_value),0) s FROM sales
     WHERE ($1::int IS NULL OR consultant_id=$1) AND sale_date >= $2`,
    [cid, weekStart]
  );
  const salesMonth = await db.queryOne<{ c: number; s: number; base: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(total_commission),0) s, COALESCE(SUM(base_value),0) base FROM sales
     WHERE ($1::int IS NULL OR consultant_id=$1) AND sale_date BETWEEN $2 AND $3`,
    [cid, monthStart, monthEnd]
  );
  const salesPrevMonth = await db.queryOne<{ c: number; s: number; base: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(total_commission),0) s, COALESCE(SUM(base_value),0) base FROM sales
     WHERE ($1::int IS NULL OR consultant_id=$1) AND sale_date BETWEEN $2 AND $3`,
    [cid, prevMonthStart, prevMonthEnd]
  );

  const instWhere = isAdmin
    ? ''
    : `WHERE s.consultant_id=${Number(req.user!.consultant_id)}`;
  const instJoin = `FROM installments i JOIN sales s ON s.id=i.sale_id ${instWhere}`;

  const pending = await db.queryOne<{ c: number; s: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(i.value),0) s ${instJoin} ${
      instWhere ? 'AND' : 'WHERE'
    } i.status='pending'`
  );
  const overdue = await db.queryOne<{ c: number; s: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(i.value),0) s ${instJoin} ${
      instWhere ? 'AND' : 'WHERE'
    } (i.status='overdue' OR i.bill_overdue=1)`
  );
  const paid = await db.queryOne<{ c: number; s: number }>(
    `SELECT COUNT(*)::int c, COALESCE(SUM(i.value),0) s ${instJoin} ${
      instWhere ? 'AND' : 'WHERE'
    } i.status='paid'`
  );

  const commissionAll = await db.queryOne<{ s: number }>(
    `SELECT COALESCE(SUM(total_commission),0) s FROM sales
     WHERE ($1::int IS NULL OR consultant_id=$1)`,
    [cid]
  );

  let targetMonthly = 0;
  if (isAdmin) {
    const row = await db.queryOne<{ t: number; c: number }>(
      'SELECT COALESCE(SUM(monthly_target),0) t, COUNT(*)::int c FROM consultants WHERE active=1'
    );
    targetMonthly = row?.t ?? 0;
  } else {
    const row = await db.queryOne<{ t: number }>(
      'SELECT COALESCE(monthly_target,0) t FROM consultants WHERE id=$1',
      [req.user!.consultant_id]
    );
    targetMonthly = row?.t ?? 0;
  }

  const targetAchieved = salesMonth?.base || 0;
  const targetPct = targetMonthly > 0 ? (targetAchieved / targetMonthly) * 100 : 0;
  const daysLeft = Math.max(0, dayjs().endOf('month').diff(dayjs(), 'day'));

  res.json({
    today: { count: salesToday?.c ?? 0, commission: salesToday?.s ?? 0 },
    week: { count: salesWeek?.c ?? 0, base: salesWeek?.s ?? 0 },
    month: {
      count: salesMonth?.c ?? 0,
      commission: salesMonth?.s ?? 0,
      base: salesMonth?.base ?? 0,
    },
    prevMonth: {
      count: salesPrevMonth?.c ?? 0,
      commission: salesPrevMonth?.s ?? 0,
      base: salesPrevMonth?.base ?? 0,
    },
    installments: {
      paid: { count: paid?.c ?? 0, total: paid?.s ?? 0 },
      pending: { count: pending?.c ?? 0, total: pending?.s ?? 0 },
      overdue: { count: overdue?.c ?? 0, total: overdue?.s ?? 0 },
    },
    totals: { commission: commissionAll?.s ?? 0 },
    target: {
      monthly: targetMonthly,
      achieved: targetAchieved,
      pct: targetPct,
      daysLeft,
      isAggregate: isAdmin,
    },
  });
});

router.get('/ranking', requireAuth, async (req, res) => {
  const start = (req.query.start as string) || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = (req.query.end as string) || dayjs().endOf('month').format('YYYY-MM-DD');
  const isAdmin = req.user!.role === 'admin';
  const rows = await db.queryAll<{
    id: number;
    name: string;
    monthly_target: number;
    total_base: number;
    total_commission: number;
    sale_count: number;
  }>(
    `SELECT c.id, c.name, c.monthly_target,
            COALESCE(SUM(s.base_value),0) total_base,
            COALESCE(SUM(s.total_commission),0) total_commission,
            COUNT(s.id)::int sale_count
       FROM consultants c
       LEFT JOIN sales s ON s.consultant_id=c.id AND s.sale_date BETWEEN $1 AND $2
       WHERE c.active=1
       GROUP BY c.id
       ORDER BY total_base DESC, LOWER(c.name)`,
    [start, end]
  );

  const result = rows.map((r) => {
    const tier = tierFor(r.total_base);
    return {
      ...r,
      total_commission: isAdmin || r.id === req.user!.consultant_id ? r.total_commission : null,
      tier: tier.name,
      tier_color: tier.color,
    };
  });
  res.json(result);
});

router.get('/recebimentos', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'admin';
  const month = (req.query.month as string) || dayjs().format('YYYY-MM');
  const consultantId = isAdmin
    ? req.query.consultant_id
      ? Number(req.query.consultant_id)
      : null
    : req.user!.consultant_id;

  const monthStart = dayjs(`${month}-01`).startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');

  const rows = await db.queryAll(
    `SELECT i.*, s.consultant_id, s.consultant_name, s.client_name, s.product
       FROM installments i
       JOIN sales s ON s.id = i.sale_id
      WHERE i.due_date BETWEEN $1 AND $2
        AND ($3::int IS NULL OR s.consultant_id=$3)
      ORDER BY i.due_date ASC`,
    [monthStart, monthEnd, consultantId]
  );
  res.json(rows);
});

export default router;
