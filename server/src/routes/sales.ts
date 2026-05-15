import { Router } from 'express';
import dayjs from 'dayjs';
import { db } from '../db';
import { requireAuth } from '../middleware';
import { SaleRow, InstallmentRow, SaleQuotaRow, ConsultantRow } from '../types';
import {
  buildInstallments,
  calcCommission,
  isInCancellationPhase,
  isOverdue,
  round2,
} from '../utils/commission';

const router = Router();

interface SaleWithChildren extends SaleRow {
  quotas_list: SaleQuotaRow[];
  installments: (InstallmentRow & { computed_overdue: boolean; cancellation_phase: boolean })[];
}

function loadSale(id: number): SaleWithChildren | null {
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id) as SaleRow | undefined;
  if (!sale) return null;
  const installments = db
    .prepare('SELECT * FROM installments WHERE sale_id=? ORDER BY number')
    .all(id) as InstallmentRow[];
  const quotas = db
    .prepare('SELECT * FROM sale_quotas WHERE sale_id=? ORDER BY number')
    .all(id) as SaleQuotaRow[];
  const enrichedInstallments = installments.map((i) => {
    const overdueNow = isOverdue(i.due_date, i.status);
    const status: InstallmentRow['status'] =
      i.status === 'paid' ? 'paid' : overdueNow ? 'overdue' : 'pending';
    if (status !== i.status) {
      db.prepare('UPDATE installments SET status=? WHERE id=?').run(status, i.id);
    }
    return {
      ...i,
      status,
      computed_overdue: overdueNow && i.status !== 'paid',
      cancellation_phase: isInCancellationPhase(i.due_date, !!i.bill_overdue, status),
    };
  });
  return { ...sale, installments: enrichedInstallments, quotas_list: quotas };
}

function userCanSeeSale(req: any, sale: SaleRow): boolean {
  if (req.user.role === 'admin') return true;
  return sale.consultant_id === req.user.consultant_id;
}

router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user!.role === 'admin';
  const rows = (
    isAdmin
      ? (db.prepare('SELECT * FROM sales ORDER BY sale_date DESC, id DESC').all() as SaleRow[])
      : (db
          .prepare(
            'SELECT * FROM sales WHERE consultant_id=? ORDER BY sale_date DESC, id DESC'
          )
          .all(req.user!.consultant_id) as SaleRow[])
  );
  const full = rows.map((r) => loadSale(r.id)!);
  res.json(full);
});

router.get('/:id', requireAuth, (req, res) => {
  const sale = loadSale(Number(req.params.id));
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  res.json(sale);
});

function recomputeQuotas(saleId: number, quotas: { number: number; value: number }[]) {
  db.prepare('DELETE FROM sale_quotas WHERE sale_id=?').run(saleId);
  const stmt = db.prepare('INSERT INTO sale_quotas (sale_id,number,value) VALUES (?,?,?)');
  for (const q of quotas) stmt.run(saleId, q.number, q.value);
}

function regenerateInstallments(saleId: number, totalCommission: number, saleDate: string) {
  const existing = db
    .prepare('SELECT * FROM installments WHERE sale_id=? ORDER BY number')
    .all(saleId) as InstallmentRow[];
  const built = buildInstallments(totalCommission, saleDate, existing.length || 6);
  db.prepare('DELETE FROM installments WHERE sale_id=?').run(saleId);
  const stmt = db.prepare(
    'INSERT INTO installments (sale_id,number,value,due_date,status,bill_overdue,paid_date) VALUES (?,?,?,?,?,?,?)'
  );
  built.forEach((b, idx) => {
    const ex = existing[idx];
    stmt.run(
      saleId,
      b.number,
      b.value,
      b.due_date,
      ex?.status ?? 'pending',
      ex?.bill_overdue ?? 0,
      ex?.paid_date ?? null
    );
  });
}

router.post('/', requireAuth, (req, res) => {
  const b = req.body as Partial<SaleRow> & { quotas_list?: { value: number }[] };
  const isAdmin = req.user!.role === 'admin';
  const consultantId = isAdmin ? Number(b.consultant_id) : Number(req.user!.consultant_id);
  if (!consultantId) return res.status(400).json({ error: 'consultant_id required' });
  const consultant = db
    .prepare('SELECT * FROM consultants WHERE id=?')
    .get(consultantId) as ConsultantRow | undefined;
  if (!consultant) return res.status(400).json({ error: 'consultant not found' });

  const quotasList =
    b.quotas_list && b.quotas_list.length > 0
      ? b.quotas_list.map((q, i) => ({ number: i + 1, value: Number(q.value) || 0 }))
      : [];

  const baseFromQuotas = quotasList.reduce((s, q) => s + q.value, 0);
  const base_value = round2(quotasList.length > 0 ? baseFromQuotas : Number(b.base_value) || 0);
  const quotasCount = quotasList.length || Number(b.quotas) || 1;
  const unit_value = quotasCount ? round2(base_value / quotasCount) : 0;
  const commission_percentage = Number(b.commission_percentage ?? 0.8);
  const total_commission = calcCommission(base_value, commission_percentage);
  const sale_date = (b.sale_date || dayjs().format('YYYY-MM-DD')).slice(0, 10);

  const groupQuota =
    typeof b.group_quota === 'string' && b.group_quota.trim() !== '' ? b.group_quota.trim() : null;

  const info = db
    .prepare(
      `INSERT INTO sales (
        consultant_id, consultant_name, client_number, client_name, product, sale_date,
        insurance, base_value, quotas, unit_value, commission_percentage, total_commission,
        group_quota
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      consultantId,
      consultant.name,
      b.client_number ?? null,
      b.client_name ?? '',
      b.product ?? 'Imóvel',
      sale_date,
      b.insurance ? 1 : 0,
      base_value,
      quotasCount,
      unit_value,
      commission_percentage,
      total_commission,
      groupQuota
    );
  const saleId = Number(info.lastInsertRowid);

  if (quotasList.length > 0) recomputeQuotas(saleId, quotasList);
  const built = buildInstallments(total_commission, sale_date, 6);
  const stmt = db.prepare(
    'INSERT INTO installments (sale_id,number,value,due_date) VALUES (?,?,?,?)'
  );
  for (const i of built) stmt.run(saleId, i.number, i.value, i.due_date);

  res.json(loadSale(saleId));
});

router.put('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id) as SaleRow | undefined;
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });

  const b = req.body as Partial<SaleRow>;
  const isAdmin = req.user!.role === 'admin';
  const consultantId = isAdmin && b.consultant_id ? Number(b.consultant_id) : sale.consultant_id;
  const consultant = db
    .prepare('SELECT * FROM consultants WHERE id=?')
    .get(consultantId) as ConsultantRow;

  const base_value = b.base_value !== undefined ? round2(Number(b.base_value)) : sale.base_value;
  const quotasCount = b.quotas !== undefined ? Number(b.quotas) : sale.quotas;
  const unit_value = quotasCount ? round2(base_value / quotasCount) : 0;
  const commission_percentage =
    b.commission_percentage !== undefined
      ? Number(b.commission_percentage)
      : sale.commission_percentage;
  const total_commission = calcCommission(base_value, commission_percentage);
  const sale_date = (b.sale_date ?? sale.sale_date).slice(0, 10);

  const groupQuotaUpdate =
    b.group_quota === undefined
      ? sale.group_quota
      : typeof b.group_quota === 'string' && b.group_quota.trim() !== ''
        ? b.group_quota.trim()
        : null;

  db.prepare(
    `UPDATE sales SET
      consultant_id=?, consultant_name=?, client_number=?, client_name=?, product=?, sale_date=?,
      insurance=?, base_value=?, quotas=?, unit_value=?, commission_percentage=?,
      total_commission=?, group_quota=? WHERE id=?`
  ).run(
    consultantId,
    consultant.name,
    b.client_number ?? sale.client_number,
    b.client_name ?? sale.client_name,
    b.product ?? sale.product,
    sale_date,
    b.insurance === undefined ? sale.insurance : b.insurance ? 1 : 0,
    base_value,
    quotasCount,
    unit_value,
    commission_percentage,
    total_commission,
    groupQuotaUpdate,
    id
  );

  regenerateInstallments(id, total_commission, sale_date);
  res.json(loadSale(id));
});

router.delete('/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id) as SaleRow | undefined;
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM sales WHERE id=?').run(id);
  res.json({ ok: true });
});

router.put('/:id/quotas', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id) as SaleRow | undefined;
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  const body = req.body as { quotas?: { number?: number; value: number }[] };
  const list = (body.quotas || []).map((q, i) => ({
    number: q.number ?? i + 1,
    value: Number(q.value) || 0,
  }));
  recomputeQuotas(id, list);
  const base_value = round2(list.reduce((s, q) => s + q.value, 0));
  const quotasCount = list.length || 1;
  const unit_value = round2(base_value / quotasCount);
  const total_commission = calcCommission(base_value, sale.commission_percentage);
  db.prepare(
    'UPDATE sales SET base_value=?, quotas=?, unit_value=?, total_commission=? WHERE id=?'
  ).run(base_value, quotasCount, unit_value, total_commission, id);
  regenerateInstallments(id, total_commission, sale.sale_date);
  res.json(loadSale(id));
});

router.put('/:id/installments', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare('SELECT * FROM sales WHERE id=?').get(id) as SaleRow | undefined;
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  const body = req.body as {
    installments: Partial<InstallmentRow>[];
  };
  const stmt = db.prepare(
    `UPDATE installments SET status=?, bill_overdue=?, paid_date=?, due_date=?, value=? WHERE id=?`
  );
  for (const i of body.installments || []) {
    if (!i.id) continue;
    const existing = db.prepare('SELECT * FROM installments WHERE id=?').get(i.id) as
      | InstallmentRow
      | undefined;
    if (!existing || existing.sale_id !== id) continue;
    const status = (i.status as InstallmentRow['status']) ?? existing.status;
    const billOverdue = i.bill_overdue === undefined ? existing.bill_overdue : i.bill_overdue ? 1 : 0;
    const paidDate =
      status === 'paid'
        ? i.paid_date ?? existing.paid_date ?? dayjs().format('YYYY-MM-DD')
        : null;
    stmt.run(
      status,
      billOverdue,
      paidDate,
      i.due_date ?? existing.due_date,
      i.value ?? existing.value,
      existing.id
    );
  }
  res.json(loadSale(id));
});

export default router;
