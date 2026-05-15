/**
 * Seed de demo. Roda com:
 *   npm --prefix server run seed            (só popula se DB estiver vazio)
 *   npm --prefix server run seed -- --reset (limpa vendas/consultores e regenera)
 *
 * Estratégia:
 *  - Metas mensais na casa do milhão (R$ 1.2M a R$ 2.0M por consultor)
 *  - Mês corrente: cada consultor fecha ~92% da meta (88-96% pra variar)
 *  - Meses anteriores: 75-105% da meta (pra ranking/anual ficarem dinâmicos)
 *  - 4-7 vendas/consultor/mês distribuídas uniformemente pelos dias
 *    → gráficos semanal/mensal/anual ficam suaves, sem buracos nem picos
 */
import 'dotenv/config';
import dayjs from 'dayjs';
import { db, initDb, closeDb, tx } from '../src/db';
import { buildInstallments, calcCommission, round2 } from '../src/utils/commission';

const RESET = process.argv.includes('--reset');

async function main() {
  await initDb();

  if (RESET) {
    console.log('[seed] --reset: limpando vendas, parcelas, cotas e consultores...');
    await tx(async (t) => {
      await t.exec('DELETE FROM installments');
      await t.exec('DELETE FROM sale_quotas');
      await t.exec('DELETE FROM sales');
      await t.exec("DELETE FROM users WHERE role='consultant'");
      await t.exec('DELETE FROM consultants');
    });
  }

  const consultants = [
    { name: 'João Silva', email: 'joao.silva@racon.test', monthly_target: 1_500_000 },
    { name: 'Maria Oliveira', email: 'maria.oliveira@racon.test', monthly_target: 1_800_000 },
    { name: 'Carlos Mendes', email: 'carlos.mendes@racon.test', monthly_target: 1_400_000 },
    { name: 'Ana Costa', email: 'ana.costa@racon.test', monthly_target: 1_650_000 },
    { name: 'Rafael Santos', email: 'rafael.santos@racon.test', monthly_target: 1_300_000 },
    { name: 'Juliana Pereira', email: 'juliana.pereira@racon.test', monthly_target: 1_700_000 },
    { name: 'Bruno Albuquerque', email: 'bruno.albu@racon.test', monthly_target: 1_250_000 },
    { name: 'Patrícia Moraes', email: 'patricia.moraes@racon.test', monthly_target: 2_000_000 },
  ];

  const products = ['Imóvel', 'Auto', 'Moto', 'Agro', 'Serviços'] as const;
  type Product = (typeof products)[number];

  const pctByProduct: Record<Product, number[]> = {
    'Imóvel': [0.8, 0.9, 1.0],
    'Auto': [1.1, 1.2, 1.3],
    'Moto': [1.4, 1.5, 1.6],
    'Agro': [0.6, 0.7, 0.8],
    'Serviços': [1.8, 2.0, 2.2],
  };

  const firstNames = [
    'Pedro', 'Lúcia', 'Rafael', 'Beatriz', 'Fernando', 'Tatiana', 'Roberto', 'Camila',
    'Eduardo', 'Mariana', 'Gustavo', 'Renata', 'Felipe', 'Larissa', 'Diego', 'Vanessa',
    'Thiago', 'Aline', 'Marcelo', 'Sandra', 'Vinícius', 'Caroline', 'Leonardo', 'Priscila',
    'Henrique', 'Bianca', 'Lucas', 'Daniela', 'Rodrigo', 'Cristina', 'Antônio', 'Joana',
    'Ricardo', 'Helena', 'Marcos', 'Paula', 'Igor', 'Mônica', 'André', 'Letícia',
  ];
  const lastNames = [
    'Almeida', 'Santos', 'Souza', 'Lima', 'Castro', 'Reis', 'Diniz', 'Vieira',
    'Ferreira', 'Gomes', 'Rodrigues', 'Carvalho', 'Martins', 'Rocha', 'Barbosa', 'Nascimento',
    'Cardoso', 'Cavalcanti', 'Moura', 'Pinto', 'Sá', 'Teixeira', 'Ramos', 'Andrade',
    'Pires', 'Correia', 'Borges', 'Freitas', 'Macedo', 'Tavares',
  ];

  function rand<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function randomName() {
    return `${rand(firstNames)} ${rand(lastNames)}`;
  }
  function roundToK(n: number, k = 1000) {
    return Math.round(n / k) * k;
  }

  function pickProductForSize(size: number): Product {
    if (size >= 1_200_000) return rand(['Imóvel', 'Agro'] as const);
    if (size >= 500_000) return rand(['Imóvel', 'Agro', 'Auto'] as const);
    if (size >= 200_000) return rand(['Imóvel', 'Auto', 'Serviços'] as const);
    if (size >= 80_000) return rand(['Auto', 'Moto', 'Serviços'] as const);
    return rand(['Moto', 'Serviços'] as const);
  }

  function splitQuotas(total: number, n: number): number[] {
    if (n <= 1) return [roundToK(total)];
    const weights = Array.from({ length: n }, () => 0.5 + Math.random());
    const sumW = weights.reduce((a, b) => a + b, 0);
    const parts = weights.map((w) => roundToK((w / sumW) * total));
    const diff = total - parts.reduce((a, b) => a + b, 0);
    parts[parts.length - 1] = roundToK(parts[parts.length - 1] + diff);
    return parts.filter((p) => p > 0);
  }

  const consultantIds: Record<string, number> = {};
  for (const c of consultants) {
    const existing = await db.queryOne<{ id: number }>(
      'SELECT id FROM consultants WHERE LOWER(name)=LOWER($1)',
      [c.name]
    );
    if (existing) {
      consultantIds[c.name] = existing.id;
      await db.queryRun(
        'UPDATE consultants SET email=$1, monthly_target=$2 WHERE id=$3',
        [c.email, c.monthly_target, existing.id]
      );
    } else {
      const r = await db.queryRun(
        'INSERT INTO consultants (name,email,active,monthly_target) VALUES ($1,$2,1,$3) RETURNING id',
        [c.name, c.email, c.monthly_target]
      );
      consultantIds[c.name] = r.rows[0].id;
      console.log(
        `  + consultor: ${c.name} (meta R$ ${c.monthly_target.toLocaleString('pt-BR')})`
      );
    }
  }

  const salesCount = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*)::int c FROM sales'
  );
  if ((salesCount?.c ?? 0) > 0 && !RESET) {
    console.log(
      `[seed] já existem ${salesCount?.c} vendas — pulando. Rode com -- --reset pra regerar.`
    );
    await closeDb();
    return;
  }

  let clientNum = 7001;

  async function createSale(consultantName: string, saleDate: string, size: number) {
    const product = pickProductForSize(size);
    const pct = rand(pctByProduct[product]);
    const heavy = product === 'Imóvel' || product === 'Agro';
    const quotaCount = heavy ? (Math.random() < 0.5 ? 2 : Math.random() < 0.5 ? 3 : 1) : 1;
    const quotas = splitQuotas(size, quotaCount);
    const baseValue = round2(quotas.reduce((a, b) => a + b, 0));
    const totalCommission = calcCommission(baseValue, pct);
    const insurance = Math.random() < 0.25 ? 1 : 0;
    const groupQuota = `G${1000 + Math.floor(Math.random() * 9000)} / C${String(
      Math.floor(Math.random() * 999)
    ).padStart(3, '0')}`;

    const r = await db.queryRun(
      `INSERT INTO sales (
          consultant_id, consultant_name, client_number, client_name, product, sale_date,
          insurance, base_value, quotas, unit_value, commission_percentage, total_commission, group_quota
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        consultantIds[consultantName],
        consultantName,
        String(clientNum++),
        randomName(),
        product,
        saleDate,
        insurance,
        baseValue,
        quotas.length,
        round2(baseValue / quotas.length),
        pct,
        totalCommission,
        groupQuota,
      ]
    );
    const saleId = r.rows[0].id;
    for (let qi = 0; qi < quotas.length; qi++) {
      await db.queryRun(
        'INSERT INTO sale_quotas (sale_id,number,value) VALUES ($1,$2,$3)',
        [saleId, qi + 1, quotas[qi]]
      );
    }
    const built = buildInstallments(totalCommission, saleDate, 6);
    for (const b of built) {
      await db.queryRun(
        'INSERT INTO installments (sale_id,number,value,due_date) VALUES ($1,$2,$3,$4)',
        [saleId, b.number, b.value, b.due_date]
      );
    }
  }

  function distributeRevenue(revenue: number, count: number): number[] {
    const weights = Array.from({ length: count }, () => 0.4 + Math.random() * 1.6);
    const sumW = weights.reduce((a, b) => a + b, 0);
    const sizes = weights.map((w) => roundToK((w / sumW) * revenue));
    const diff = revenue - sizes.reduce((a, b) => a + b, 0);
    sizes[sizes.length - 1] = roundToK(Math.max(40_000, sizes[sizes.length - 1] + diff));
    return sizes;
  }

  const dowWeight = [0.15, 1.0, 1.25, 1.35, 1.4, 1.05, 0.35];

  function buildDayWeights(monthStart: dayjs.Dayjs, lastDay: number, endBias: number): number[] {
    return Array.from({ length: lastDay }, (_, i) => {
      const d = monthStart.add(i, 'day');
      const dow = dowWeight[d.day()];
      const endOfMonth = 0.7 + ((i + 1) / lastDay) * endBias;
      const noise = 0.55 + Math.random() * 0.9;
      return Math.max(0.05, dow * endOfMonth * noise);
    });
  }

  function pickDayByWeight(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  const seasonalMultiplier = [
    0.68, 0.82, 1.05, 0.74, 0.95, 1.18, 1.30, 0.62, 0.88, 1.12, 0.92,
  ];

  const today = dayjs();
  const currentMonthStart = today.startOf('month');
  const daysSoFar = today.date();

  // MÊS CORRENTE
  for (const c of consultants) {
    const pct = 0.88 + Math.random() * 0.08;
    const revenue = c.monthly_target * pct;
    const count = 5 + Math.floor(Math.random() * 4);
    const sizes = distributeRevenue(revenue, count);
    const weights = buildDayWeights(currentMonthStart, daysSoFar, 1.0);
    for (let i = 0; i < count; i++) {
      const day = pickDayByWeight(weights);
      const saleDate = currentMonthStart.add(day, 'day').format('YYYY-MM-DD');
      await createSale(c.name, saleDate, sizes[i]);
    }
  }

  // 11 MESES ANTERIORES
  for (let m = 1; m <= 11; m++) {
    const monthStart = today.subtract(m, 'month').startOf('month');
    const daysInMonth = monthStart.daysInMonth();
    const seasonal = seasonalMultiplier[11 - m];
    for (const c of consultants) {
      const consultantNoise = 0.82 + Math.random() * 0.36;
      const revenue = c.monthly_target * seasonal * consultantNoise;
      const count = 4 + Math.floor(Math.random() * 4);
      const sizes = distributeRevenue(revenue, count);
      const weights = buildDayWeights(monthStart, daysInMonth, 0.8);
      for (let i = 0; i < count; i++) {
        const day = pickDayByWeight(weights);
        const saleDate = monthStart.add(day, 'day').format('YYYY-MM-DD');
        await createSale(c.name, saleDate, sizes[i]);
      }
    }
  }

  // Parcelas: ~80% das vencidas viram pagas (CURRENT_DATE em Postgres)
  await db.exec(`
    UPDATE installments
    SET status='paid',
        paid_date=due_date + (floor(random()*5)::int) * INTERVAL '1 day'
    WHERE due_date <= CURRENT_DATE
      AND (id % 10) < 8
  `);
  await db.exec(`
    UPDATE installments
    SET bill_overdue=1
    WHERE status='pending' AND due_date < CURRENT_DATE
  `);

  const finalCount = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*)::int c FROM sales'
  );
  const paidCount = await db.queryOne<{ c: number }>(
    "SELECT COUNT(*)::int c FROM installments WHERE status='paid'"
  );
  const overdueCount = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*)::int c FROM installments WHERE bill_overdue=1'
  );

  const monthAch = await db.queryAll<{ name: string; monthly_target: number; total: number }>(
    `SELECT c.name, c.monthly_target, COALESCE(SUM(s.base_value),0) total
       FROM consultants c
       LEFT JOIN sales s ON s.consultant_id=c.id
                         AND s.sale_date >= date_trunc('month', CURRENT_DATE)
                         AND s.sale_date <= CURRENT_DATE
      WHERE c.active=1
      GROUP BY c.id, c.name, c.monthly_target ORDER BY c.name`
  );

  console.log('');
  console.log(`[seed] feito: ${consultants.length} consultores, ${finalCount?.c} vendas`);
  console.log(`        parcelas: ${paidCount?.c} pagas, ${overdueCount?.c} em atraso`);
  console.log('');
  console.log('[seed] atingimento do mês corrente:');
  let aggT = 0;
  let aggA = 0;
  for (const r of monthAch) {
    const p = (r.total / r.monthly_target) * 100;
    aggT += r.monthly_target;
    aggA += r.total;
    console.log(
      `        ${r.name.padEnd(22)} R$ ${r.total.toLocaleString('pt-BR').padStart(13)} / R$ ${r.monthly_target.toLocaleString('pt-BR').padStart(13)}  (${p.toFixed(1)}%)`
    );
  }
  console.log(
    `        AGREGADO              R$ ${aggA.toLocaleString('pt-BR').padStart(13)} / R$ ${aggT.toLocaleString('pt-BR').padStart(13)}  (${((aggA / aggT) * 100).toFixed(1)}%)`
  );
  console.log('');
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
