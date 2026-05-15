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

async function loadSale(id: number): Promise<SaleWithChildren | null> {
  const sale = await db.queryOne<SaleRow>('SELECT * FROM sales WHERE id=$1', [id]);
  if (!sale) return null;
  const installments = await db.queryAll<InstallmentRow>(
    'SELECT * FROM installments WHERE sale_id=$1 ORDER BY number',
    [id]
  );
  const quotas = await db.queryAll<SaleQuotaRow>(
    'SELECT * FROM sale_quotas WHERE sale_id=$1 ORDER BY number',
    [id]
  );
  const enrichedInstallments = [];
  for (const i of installments) {
    const overdueNow = isOverdue(i.due_date, i.status);
    const status: InstallmentRow['status'] =
      i.status === 'paid' ? 'paid' : overdueNow ? 'overdue' : 'pending';
    if (status !== i.status) {
      await db.queryRun('UPDATE installments SET status=$1 WHERE id=$2', [status, i.id]);
    }
    enrichedInstallments.push({
      ...i,
      status,
      computed_overdue: overdueNow && i.status !== 'paid',
      cancellation_phase: isInCancellationPhase(i.due_date, !!i.bill_overdue, status),
    });
  }
  return { ...sale, installments: enrichedInstallments, quotas_list: quotas };
}

function userCanSeeSale(req: any, sale: SaleRow): boolean {
  if (req.user.role === 'admin') return true;
  return sale.consultant_id === req.user.consultant_id;
}

router.get('/', requireAuth, async (req, res) => {
  const isAdmin = req.user!.role === 'admin';
  const rows = isAdmin
    ? await db.queryAll<SaleRow>('SELECT * FROM sales ORDER BY sale_date DESC, id DESC')
    : await db.queryAll<SaleRow>(
        'SELECT * FROM sales WHERE consultant_id=$1 ORDER BY sale_date DESC, id DESC',
        [req.user!.consultant_id]
      );
  const full = [];
  for (const r of rows) full.push(await loadSale(r.id));
  res.json(full);
});

router.get('/:id', requireAuth, async (req, res) => {
  const sale = await loadSale(Number(req.params.id));
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  res.json(sale);
});

async function recomputeQuotas(saleId: number, quotas: { number: number; value: number }[]) {
  await db.queryRun('DELETE FROM sale_quotas WHERE sale_id=$1', [saleId]);
  for (const q of quotas) {
    await db.queryRun(
      'INSERT INTO sale_quotas (sale_id,number,value) VALUES ($1,$2,$3)',
      [saleId, q.number, q.value]
    );
  }
}

async function regenerateInstallments(saleId: number, totalCommission: number, saleDate: string) {
  const existing = await db.queryAll<InstallmentRow>(
    'SELECT * FROM installments WHERE sale_id=$1 ORDER BY number',
    [saleId]
  );
  const built = buildInstallments(totalCommission, saleDate, existing.length || 6);
  await db.queryRun('DELETE FROM installments WHERE sale_id=$1', [saleId]);
  for (let idx = 0; idx < built.length; idx++) {
    const b = built[idx];
    const ex = existing[idx];
    await db.queryRun(
      'INSERT INTO installments (sale_id,number,value,due_date,status,bill_overdue,paid_date) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        saleId,
        b.number,
        b.value,
        b.due_date,
        ex?.status ?? 'pending',
        ex?.bill_overdue ?? 0,
        ex?.paid_date ?? null,
      ]
    );
  }
}

router.post('/', requireAuth, async (req, res) => {
  const b = req.body as Partial<SaleRow> & { quotas_list?: { value: number }[] };
  const isAdmin = req.user!.role === 'admin';
  const consultantId = isAdmin ? Number(b.consultant_id) : Number(req.user!.consultant_id);
  if (!consultantId) return res.status(400).json({ error: 'consultant_id required' });
  const consultant = await db.queryOne<ConsultantRow>(
    'SELECT * FROM consultants WHERE id=$1',
    [consultantId]
  );
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

  const inserted = await db.queryRun(
    `INSERT INTO sales (
        consultant_id, consultant_name, client_number, client_name, product, sale_date,
        insurance, base_value, quotas, unit_value, commission_percentage, total_commission,
        group_quota
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
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
      groupQuota,
    ]
  );
  const saleId = inserted.rows[0].id;

  if (quotasList.length > 0) await recomputeQuotas(saleId, quotasList);
  const built = buildInstallments(total_commission, sale_date, 6);
  for (const i of built) {
    await db.queryRun(
      'INSERT INTO installments (sale_id,number,value,due_date) VALUES ($1,$2,$3,$4)',
      [saleId, i.number, i.value, i.due_date]
    );
  }

  res.json(await loadSale(saleId));
});

router.put('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sale = await db.queryOne<SaleRow>('SELECT * FROM sales WHERE id=$1', [id]);
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });

  const b = req.body as Partial<SaleRow>;
  const isAdmin = req.user!.role === 'admin';
  const consultantId = isAdmin && b.consultant_id ? Number(b.consultant_id) : sale.consultant_id;
  const consultant = await db.queryOne<ConsultantRow>(
    'SELECT * FROM consultants WHERE id=$1',
    [consultantId]
  );

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

  await db.queryRun(
    `UPDATE sales SET
      consultant_id=$1, consultant_name=$2, client_number=$3, client_name=$4, product=$5, sale_date=$6,
      insurance=$7, base_value=$8, quotas=$9, unit_value=$10, commission_percentage=$11,
      total_commission=$12, group_quota=$13 WHERE id=$14`,
    [
      consultantId,
      consultant!.name,
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
      id,
    ]
  );

  await regenerateInstallments(id, total_commission, sale_date);
  res.json(await loadSale(id));
});

router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sale = await db.queryOne<SaleRow>('SELECT * FROM sales WHERE id=$1', [id]);
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  await db.queryRun('DELETE FROM sales WHERE id=$1', [id]);
  res.json({ ok: true });
});

router.put('/:id/quotas', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sale = await db.queryOne<SaleRow>('SELECT * FROM sales WHERE id=$1', [id]);
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  const body = req.body as { quotas?: { number?: number; value: number }[] };
  const list = (body.quotas || []).map((q, i) => ({
    number: q.number ?? i + 1,
    value: Number(q.value) || 0,
  }));
  await recomputeQuotas(id, list);
  const base_value = round2(list.reduce((s, q) => s + q.value, 0));
  const quotasCount = list.length || 1;
  const unit_value = round2(base_value / quotasCount);
  const total_commission = calcCommission(base_value, sale.commission_percentage);
  await db.queryRun(
    'UPDATE sales SET base_value=$1, quotas=$2, unit_value=$3, total_commission=$4 WHERE id=$5',
    [base_value, quotasCount, unit_value, total_commission, id]
  );
  await regenerateInstallments(id, total_commission, sale.sale_date);
  res.json(await loadSale(id));
});

router.put('/:id/installments', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sale = await db.queryOne<SaleRow>('SELECT * FROM sales WHERE id=$1', [id]);
  if (!sale) return res.status(404).json({ error: 'not found' });
  if (!userCanSeeSale(req, sale)) return res.status(403).json({ error: 'forbidden' });
  const body = req.body as { installments: Partial<InstallmentRow>[] };
  for (const i of body.installments || []) {
    if (!i.id) continue;
    const existing = await db.queryOne<InstallmentRow>(
      'SELECT * FROM installments WHERE id=$1',
      [i.id]
    );
    if (!existing || existing.sale_id !== id) continue;
    const status = (i.status as InstallmentRow['status']) ?? existing.status;
    const billOverdue =
      i.bill_overdue === undefined ? existing.bill_overdue : i.bill_overdue ? 1 : 0;
    const paidDate =
      status === 'paid'
        ? i.paid_date ?? existing.paid_date ?? dayjs().format('YYYY-MM-DD')
        : null;
    await db.queryRun(
      `UPDATE installments SET status=$1, bill_overdue=$2, paid_date=$3, due_date=$4, value=$5 WHERE id=$6`,
      [
        status,
        billOverdue,
        paidDate,
        i.due_date ?? existing.due_date,
        i.value ?? existing.value,
        existing.id,
      ]
    );
  }
  res.json(await loadSale(id));
});

export default router;
