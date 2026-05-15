import { Router } from 'express';
import dayjs from 'dayjs';
import { db } from '../db';
import { requireAuth } from '../middleware';
import { tierFor } from '../utils/tiers';

const router = Router();

router.get('/summary', requireAuth, (req, res) => {
  const isAdmin = req.user!.role === 'admin';
  const params: any[] = [];
  let where = '';
  if (!isAdmin) {
    where = 'WHERE consultant_id = ?';
    params.push(req.user!.consultant_id);
  }
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
  const prevMonthStart = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const prevMonthEnd = dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  const salesToday = db
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(total_commission),0) s FROM sales ${where}${
        where ? ' AND' : ' WHERE'
      } sale_date = ?`
    )
    .get(...params, today) as { c: number; s: number };
  const salesWeek = db
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(base_value),0) s FROM sales ${where}${
        where ? ' AND' : ' WHERE'
      } sale_date >= ?`
    )
    .get(...params, weekStart) as { c: number; s: number };
  const salesMonth = db
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(total_commission),0) s, COALESCE(SUM(base_value),0) base FROM sales ${where}${
        where ? ' AND' : ' WHERE'
      } sale_date BETWEEN ? AND ?`
    )
    .get(...params, monthStart, monthEnd) as { c: number; s: number; base: number };
  const salesPrevMonth = db
    .prepare(
      `SELECT COUNT(*) c, COALESCE(SUM(total_commission),0) s, COALESCE(SUM(base_value),0) base FROM sales ${where}${
        where ? ' AND' : ' WHERE'
      } sale_date BETWEEN ? AND ?`
    )
    .get(...params, prevMonthStart, prevMonthEnd) as { c: number; s: number; base: number };

  const installmentBase = isAdmin
    ? `SELECT i.* FROM installments i`
    : `SELECT i.* FROM installments i JOIN sales s ON s.id=i.sale_id WHERE s.consultant_id=${req.user!.consultant_id}`;

  const pending = db
    .prepare(`SELECT COUNT(*) c, COALESCE(SUM(value),0) s FROM (${installmentBase}) x WHERE x.status='pending'`)
    .get() as { c: number; s: number };
  const overdue = db
    .prepare(`SELECT COUNT(*) c, COALESCE(SUM(value),0) s FROM (${installmentBase}) x WHERE x.status='overdue' OR x.bill_overdue=1`)
    .get() as { c: number; s: number };
  const paid = db
    .prepare(`SELECT COUNT(*) c, COALESCE(SUM(value),0) s FROM (${installmentBase}) x WHERE x.status='paid'`)
    .get() as { c: number; s: number };

  const commissionAll = db
    .prepare(`SELECT COALESCE(SUM(total_commission),0) s FROM sales ${where}`)
    .get(...params) as { s: number };

  const targetRow = isAdmin
    ? (db
        .prepare(
          `SELECT COALESCE(SUM(monthly_target),0) t, COUNT(*) c FROM consultants WHERE active=1`
        )
        .get() as { t: number; c: number })
    : (db
        .prepare(`SELECT COALESCE(monthly_target,0) t FROM consultants WHERE id=?`)
        .get(req.user!.consultant_id) as { t: number } | undefined) ?? { t: 0 };
  const targetMonthly = (targetRow as { t: number }).t || 0;
  const targetAchieved = salesMonth.base || 0;
  const targetPct = targetMonthly > 0 ? (targetAchieved / targetMonthly) * 100 : 0;
  const daysLeft = Math.max(0, dayjs().endOf('month').diff(dayjs(), 'day'));

  res.json({
    today: { count: salesToday.c, commission: salesToday.s },
    week: { count: salesWeek.c, base: salesWeek.s },
    month: { count: salesMonth.c, commission: salesMonth.s, base: salesMonth.base },
    prevMonth: {
      count: salesPrevMonth.c,
      commission: salesPrevMonth.s,
      base: salesPrevMonth.base,
    },
    installments: {
      paid: { count: paid.c, total: paid.s },
      pending: { count: pending.c, total: pending.s },
      overdue: { count: overdue.c, total: overdue.s },
    },
    totals: { commission: commissionAll.s },
    target: {
      monthly: targetMonthly,
      achieved: targetAchieved,
      pct: targetPct,
      daysLeft,
      isAggregate: isAdmin,
    },
  });
});

router.get('/ranking', requireAuth, (req, res) => {
  const start = (req.query.start as string) || dayjs().startOf('month').format('YYYY-MM-DD');
  const end = (req.query.end as string) || dayjs().endOf('month').format('YYYY-MM-DD');
  const isAdmin = req.user!.role === 'admin';
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.monthly_target,
              COALESCE(SUM(s.base_value),0) total_base,
              COALESCE(SUM(s.total_commission),0) total_commission,
              COUNT(s.id) sale_count
       FROM consultants c
       LEFT JOIN sales s ON s.consultant_id=c.id AND s.sale_date BETWEEN ? AND ?
       WHERE c.active=1
       GROUP BY c.id
       ORDER BY total_base DESC, c.name COLLATE NOCASE`
    )
    .all(start, end) as {
    id: number;
    name: string;
    monthly_target: number;
    total_base: number;
    total_commission: number;
    sale_count: number;
  }[];

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

router.get('/recebimentos', requireAuth, (req, res) => {
  const isAdmin = req.user!.role === 'admin';
  const month = (req.query.month as string) || dayjs().format('YYYY-MM');
  const consultantId = isAdmin
    ? req.query.consultant_id
      ? Number(req.query.consultant_id)
      : null
    : req.user!.consultant_id;

  const monthStart = dayjs(`${month}-01`).startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');

  let sql = `SELECT i.*, s.consultant_id, s.consultant_name, s.client_name, s.product
             FROM installments i
             JOIN sales s ON s.id = i.sale_id
             WHERE i.due_date BETWEEN ? AND ?`;
  const params: any[] = [monthStart, monthEnd];
  if (consultantId) {
    sql += ' AND s.consultant_id=?';
    params.push(consultantId);
  }
  sql += ' ORDER BY i.due_date ASC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

export default router;
