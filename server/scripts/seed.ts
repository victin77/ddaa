/**
 * Seed inicial. Roda com: npx tsx scripts/seed.ts
 * Usa a mesma conexão sqlite que o app — escreve direto no banco com UTF-8 garantido.
 */
import 'dotenv/config';
import dayjs from 'dayjs';
import { db } from '../src/db';
import { buildInstallments, calcCommission, round2 } from '../src/utils/commission';

const consultants = [
  { name: 'João Silva', email: 'joao@racon.test' },
  { name: 'Maria Oliveira', email: 'maria@racon.test' },
  { name: 'Carlos Mendes', email: 'carlos@racon.test' },
  { name: 'Ana Costa', email: 'ana@racon.test' },
];

const sales = [
  {
    consultant: 'João Silva',
    client_name: 'Pedro Almeida',
    client_number: '7001',
    product: 'Imóvel',
    sale_date: dayjs().subtract(5, 'day').format('YYYY-MM-DD'),
    pct: 0.8,
    group_quota: 'G4521 / C087',
    quotas: [80000, 40000],
  },
  {
    consultant: 'Maria Oliveira',
    client_name: 'Lúcia Santos',
    client_number: '7002',
    product: 'Auto',
    sale_date: dayjs().subtract(3, 'day').format('YYYY-MM-DD'),
    pct: 1.2,
    group_quota: 'G3102 / C022',
    quotas: [35000],
  },
  {
    consultant: 'João Silva',
    client_name: 'Rafael Souza',
    client_number: '7003',
    product: 'Moto',
    sale_date: dayjs().subtract(21, 'day').format('YYYY-MM-DD'),
    pct: 1.5,
    group_quota: 'G2017 / C145',
    quotas: [18000],
  },
  {
    consultant: 'Carlos Mendes',
    client_name: 'Beatriz Lima',
    client_number: '7004',
    product: 'Agro',
    sale_date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    pct: 0.7,
    group_quota: 'G5510 / C003',
    quotas: [250000, 150000],
  },
  {
    consultant: 'Maria Oliveira',
    client_name: 'Fernando Castro',
    client_number: '7005',
    product: 'Serviços',
    sale_date: dayjs().subtract(58, 'day').format('YYYY-MM-DD'),
    pct: 2,
    group_quota: 'G1208 / C054',
    quotas: [12000],
  },
  {
    consultant: 'Ana Costa',
    client_name: 'Tatiana Reis',
    client_number: '7006',
    product: 'Imóvel',
    sale_date: dayjs().subtract(8, 'day').format('YYYY-MM-DD'),
    pct: 0.8,
    group_quota: 'G4521 / C091',
    quotas: [120000, 60000, 40000],
  },
  {
    consultant: 'Carlos Mendes',
    client_name: 'Roberto Diniz',
    client_number: '7007',
    product: 'Auto',
    sale_date: dayjs().subtract(82, 'day').format('YYYY-MM-DD'),
    pct: 1.3,
    group_quota: 'G3105 / C031',
    quotas: [55000],
  },
  {
    consultant: 'João Silva',
    client_name: 'Camila Vieira',
    client_number: '7008',
    product: 'Imóvel',
    sale_date: dayjs().format('YYYY-MM-DD'),
    pct: 0.9,
    group_quota: 'G4530 / C012',
    quotas: [200000],
  },
];

console.log('Seeding...');

const consultantIds: Record<string, number> = {};
for (const c of consultants) {
  const existing = db
    .prepare('SELECT id FROM consultants WHERE LOWER(name)=LOWER(?)')
    .get(c.name) as { id: number } | undefined;
  if (existing) {
    consultantIds[c.name] = existing.id;
  } else {
    const info = db
      .prepare('INSERT INTO consultants (name,email,active) VALUES (?,?,1)')
      .run(c.name, c.email);
    consultantIds[c.name] = Number(info.lastInsertRowid);
    console.log(`  + consultor: ${c.name}`);
  }
}

const salesCount = db.prepare('SELECT COUNT(*) c FROM sales').get() as { c: number };
if (salesCount.c > 0) {
  console.log(`  já existem ${salesCount.c} vendas — pulando seed de vendas`);
} else {
  for (const s of sales) {
    const cid = consultantIds[s.consultant];
    const baseValue = round2(s.quotas.reduce((a, b) => a + b, 0));
    const totalCommission = calcCommission(baseValue, s.pct);
    const info = db
      .prepare(
        `INSERT INTO sales (
          consultant_id, consultant_name, client_number, client_name, product, sale_date,
          insurance, base_value, quotas, unit_value, commission_percentage, total_commission, group_quota
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        cid,
        s.consultant,
        s.client_number,
        s.client_name,
        s.product,
        s.sale_date,
        0,
        baseValue,
        s.quotas.length,
        round2(baseValue / s.quotas.length),
        s.pct,
        totalCommission,
        s.group_quota
      );
    const saleId = Number(info.lastInsertRowid);
    s.quotas.forEach((v, i) =>
      db
        .prepare('INSERT INTO sale_quotas (sale_id,number,value) VALUES (?,?,?)')
        .run(saleId, i + 1, v)
    );
    const built = buildInstallments(totalCommission, s.sale_date, 6);
    for (const b of built) {
      db.prepare(
        'INSERT INTO installments (sale_id,number,value,due_date) VALUES (?,?,?,?)'
      ).run(saleId, b.number, b.value, b.due_date);
    }
    console.log(`  + venda: ${s.client_name} · ${s.product} · R$ ${baseValue}`);
  }

  // marca alguns estados pra demo
  const first = db.prepare('SELECT id FROM installments ORDER BY id LIMIT 3').all() as {
    id: number;
  }[];
  if (first[0])
    db.prepare("UPDATE installments SET status='paid', paid_date=date('now') WHERE id=?").run(
      first[0].id
    );
  if (first[1])
    db.prepare("UPDATE installments SET status='paid', paid_date=date('now') WHERE id=?").run(
      first[1].id
    );
  if (first[2])
    db.prepare('UPDATE installments SET bill_overdue=1 WHERE id=?').run(first[2].id);
}

console.log('Done.');
db.close();
