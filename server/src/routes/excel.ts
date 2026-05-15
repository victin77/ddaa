import { Router } from 'express';
import multer from 'multer';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../middleware';
import { ConsultantRow, SaleRow, InstallmentRow, SaleQuotaRow } from '../types';
import { buildInstallments, calcCommission, round2 } from '../utils/commission';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

function normalizeKey(k: string) {
  return k
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function getField(row: Record<string, any>, ...names: string[]) {
  const norm = Object.keys(row).reduce<Record<string, any>>((acc, k) => {
    acc[normalizeKey(k)] = row[k];
    return acc;
  }, {});
  for (const n of names) {
    const v = norm[normalizeKey(n)];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

router.post('/import/xlsx', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  let created = 0;
  let consultantsCreated = 0;

  const upsertConsultant = (name: string) => {
    const existing = db
      .prepare('SELECT * FROM consultants WHERE LOWER(name)=LOWER(?)')
      .get(name) as ConsultantRow | undefined;
    if (existing) return existing;
    const info = db
      .prepare('INSERT INTO consultants (name,active) VALUES (?,1)')
      .run(name.trim());
    consultantsCreated++;
    return db
      .prepare('SELECT * FROM consultants WHERE id=?')
      .get(info.lastInsertRowid) as ConsultantRow;
  };

  for (const row of rows) {
    const consultantName = getField(row, 'consultor', 'consultor_nome', 'vendedor');
    if (!consultantName) continue;
    const consultant = upsertConsultant(String(consultantName).trim());
    const clientName = String(getField(row, 'cliente', 'cliente_nome', 'nome do cliente') || '');
    const product = String(getField(row, 'produto') || 'Imóvel');
    const saleDateRaw = getField(row, 'data', 'data_venda', 'data da venda');
    const sale_date = saleDateRaw
      ? dayjs(typeof saleDateRaw === 'number' ? XLSX.SSF.parse_date_code(saleDateRaw) : saleDateRaw).format(
          'YYYY-MM-DD'
        )
      : dayjs().format('YYYY-MM-DD');
    const baseValue = Number(getField(row, 'valor', 'base', 'base_value', 'valor_base') || 0);
    const commissionPercentage = Number(getField(row, 'comissao_pct', 'pct', 'comissao') || 0.8);
    const total_commission = calcCommission(baseValue, commissionPercentage);
    const quotas = Number(getField(row, 'cotas', 'qtd_cotas') || 1);
    const groupQuotaRaw = getField(row, 'grupo_cota', 'grupocota', 'grupo', 'grupo_quota');
    const groupQuota =
      groupQuotaRaw !== undefined && String(groupQuotaRaw).trim() !== ''
        ? String(groupQuotaRaw).trim()
        : null;
    const insurance = Number(getField(row, 'seguro') || 0) ? 1 : 0;
    const clientNumber = getField(row, 'cliente_numero', 'numero_cliente', 'numero do cliente');

    const info = db
      .prepare(
        `INSERT INTO sales (
          consultant_id, consultant_name, client_number, client_name, product, sale_date,
          insurance, base_value, quotas, unit_value, commission_percentage, total_commission, group_quota
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        consultant.id,
        consultant.name,
        clientNumber ? String(clientNumber) : null,
        clientName,
        product,
        sale_date,
        insurance,
        round2(baseValue),
        quotas,
        quotas ? round2(baseValue / quotas) : 0,
        commissionPercentage,
        total_commission,
        groupQuota
      );
    const saleId = Number(info.lastInsertRowid);
    const built = buildInstallments(total_commission, sale_date, 6);
    const stmt = db.prepare('INSERT INTO installments (sale_id,number,value,due_date) VALUES (?,?,?,?)');
    for (const i of built) stmt.run(saleId, i.number, i.value, i.due_date);
    created++;
  }
  res.json({ created, consultantsCreated });
});

router.get('/export/xlsx', requireAuth, (req, res) => {
  const scope = (req.query.scope as string) || 'me';
  const isAdmin = req.user!.role === 'admin';
  if (scope === 'all' && !isAdmin) return res.status(403).json({ error: 'forbidden' });
  const sales = (
    scope === 'all'
      ? db.prepare('SELECT * FROM sales ORDER BY sale_date DESC').all()
      : db
          .prepare('SELECT * FROM sales WHERE consultant_id=? ORDER BY sale_date DESC')
          .all(req.user!.consultant_id)
  ) as SaleRow[];

  const wb = XLSX.utils.book_new();
  const wsSales = XLSX.utils.json_to_sheet(
    sales.map((s) => ({
      ID: s.id,
      Consultor: s.consultant_name,
      'Nº Cliente': s.client_number ?? '',
      Cliente: s.client_name,
      Produto: s.product,
      Data: s.sale_date,
      Seguro: s.insurance ? 'Sim' : 'Não',
      'Valor Base': s.base_value,
      Cotas: s.quotas,
      '% Comissão': s.commission_percentage,
      'Comissão Total': s.total_commission,
      'Grupo / Cota': s.group_quota ?? '',
    }))
  );
  XLSX.utils.book_append_sheet(wb, wsSales, 'Vendas');

  const installments = sales.flatMap((s) => {
    const list = db
      .prepare('SELECT * FROM installments WHERE sale_id=? ORDER BY number')
      .all(s.id) as InstallmentRow[];
    return list.map((i) => ({
      'Venda ID': s.id,
      Consultor: s.consultant_name,
      Cliente: s.client_name,
      Parcela: i.number,
      Valor: i.value,
      'Vencimento': i.due_date,
      Status: i.status,
      'Boleto Atrasado': i.bill_overdue ? 'Sim' : 'Não',
      'Pago em': i.paid_date ?? '',
    }));
  });
  const wsI = XLSX.utils.json_to_sheet(installments);
  XLSX.utils.book_append_sheet(wb, wsI, 'Parcelas');

  const quotas = sales.flatMap((s) => {
    const list = db
      .prepare('SELECT * FROM sale_quotas WHERE sale_id=? ORDER BY number')
      .all(s.id) as SaleQuotaRow[];
    return list.map((q) => ({
      'Venda ID': s.id,
      Cliente: s.client_name,
      Cota: q.number,
      Valor: q.value,
    }));
  });
  if (quotas.length > 0) {
    const wsQ = XLSX.utils.json_to_sheet(quotas);
    XLSX.utils.book_append_sheet(wb, wsQ, 'Cotas');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=racon-comissoes-${dayjs().format('YYYYMMDD')}.xlsx`
  );
  res.send(buf);
});

router.get('/export/folha-comissao', requireAuth, requireAdmin, (req, res) => {
  const month = (req.query.month as string) || dayjs().format('YYYY-MM');
  const monthStart = dayjs(`${month}-01`).startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs(`${month}-01`).endOf('month').format('YYYY-MM-DD');

  const rows = db
    .prepare(
      `SELECT
         s.consultant_id,
         s.consultant_name,
         i.value,
         i.status,
         i.bill_overdue
       FROM installments i
       JOIN sales s ON s.id = i.sale_id
       WHERE i.due_date BETWEEN ? AND ?
       ORDER BY s.consultant_name COLLATE NOCASE`
    )
    .all(monthStart, monthEnd) as {
    consultant_id: number;
    consultant_name: string;
    value: number;
    status: 'paid' | 'pending' | 'overdue';
    bill_overdue: number;
  }[];

  type Bucket = {
    consultor: string;
    aPagar: number;
    jaPago: number;
    emAtraso: number;
    total: number;
    parcelasPagas: number;
    parcelasPendentes: number;
    parcelasTotal: number;
  };
  const grouped = new Map<number, Bucket>();
  for (const r of rows) {
    const b =
      grouped.get(r.consultant_id) ?? {
        consultor: r.consultant_name,
        aPagar: 0,
        jaPago: 0,
        emAtraso: 0,
        total: 0,
        parcelasPagas: 0,
        parcelasPendentes: 0,
        parcelasTotal: 0,
      };
    b.total += r.value;
    b.parcelasTotal += 1;
    if (r.status === 'paid') {
      b.jaPago += r.value;
      b.parcelasPagas += 1;
    } else {
      b.aPagar += r.value;
      b.parcelasPendentes += 1;
      if (r.status === 'overdue' || r.bill_overdue) b.emAtraso += r.value;
    }
    grouped.set(r.consultant_id, b);
  }

  const list = Array.from(grouped.values()).sort((a, b) => b.aPagar - a.aPagar);

  const totalRow: Bucket = list.reduce(
    (acc, b) => ({
      consultor: 'TOTAL',
      aPagar: acc.aPagar + b.aPagar,
      jaPago: acc.jaPago + b.jaPago,
      emAtraso: acc.emAtraso + b.emAtraso,
      total: acc.total + b.total,
      parcelasPagas: acc.parcelasPagas + b.parcelasPagas,
      parcelasPendentes: acc.parcelasPendentes + b.parcelasPendentes,
      parcelasTotal: acc.parcelasTotal + b.parcelasTotal,
    }),
    {
      consultor: 'TOTAL',
      aPagar: 0,
      jaPago: 0,
      emAtraso: 0,
      total: 0,
      parcelasPagas: 0,
      parcelasPendentes: 0,
      parcelasTotal: 0,
    }
  );

  const aoa: any[][] = [
    [`Folha de comissão · ${dayjs(`${month}-01`).format('MMMM/YYYY')}`],
    [],
    [
      'Consultor',
      'A pagar (R$)',
      'Em atraso (R$)',
      'Já pago (R$)',
      'Total mês (R$)',
      'Parcelas pendentes',
      'Parcelas pagas',
      'Parcelas total',
    ],
    ...list.map((b) => [
      b.consultor,
      b.aPagar,
      b.emAtraso,
      b.jaPago,
      b.total,
      b.parcelasPendentes,
      b.parcelasPagas,
      b.parcelasTotal,
    ]),
    [
      'TOTAL',
      totalRow.aPagar,
      totalRow.emAtraso,
      totalRow.jaPago,
      totalRow.total,
      totalRow.parcelasPendentes,
      totalRow.parcelasPagas,
      totalRow.parcelasTotal,
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Folha de comissão');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="folha-comissao-${month}.xlsx"`
  );
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
});

export default router;
