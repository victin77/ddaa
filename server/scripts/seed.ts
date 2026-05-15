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
import { db } from '../src/db';
import { buildInstallments, calcCommission, round2 } from '../src/utils/commission';

const RESET = process.argv.includes('--reset');

if (RESET) {
  console.log('[seed] --reset: limpando vendas, parcelas, cotas e consultores...');
  db.exec('DELETE FROM installments');
  db.exec('DELETE FROM sale_quotas');
  db.exec('DELETE FROM sales');
  db.exec("DELETE FROM users WHERE role='consultant'");
  db.exec('DELETE FROM consultants');
  db.exec(
    "DELETE FROM sqlite_sequence WHERE name IN ('installments','sale_quotas','sales','consultants','users')"
  );
}

const consultants = [
  { name: 'João Silva',        email: 'joao.silva@racon.test',     monthly_target: 1_500_000 },
  { name: 'Maria Oliveira',    email: 'maria.oliveira@racon.test', monthly_target: 1_800_000 },
  { name: 'Carlos Mendes',     email: 'carlos.mendes@racon.test',  monthly_target: 1_400_000 },
  { name: 'Ana Costa',         email: 'ana.costa@racon.test',      monthly_target: 1_650_000 },
  { name: 'Rafael Santos',     email: 'rafael.santos@racon.test',  monthly_target: 1_300_000 },
  { name: 'Juliana Pereira',   email: 'juliana.pereira@racon.test',monthly_target: 1_700_000 },
  { name: 'Bruno Albuquerque', email: 'bruno.albu@racon.test',     monthly_target: 1_250_000 },
  { name: 'Patrícia Moraes',   email: 'patricia.moraes@racon.test',monthly_target: 2_000_000 },
];

const products = ['Imóvel', 'Auto', 'Moto', 'Agro', 'Serviços'] as const;
type Product = (typeof products)[number];

const pctByProduct: Record<Product, number[]> = {
  'Imóvel':   [0.8, 0.9, 1.0],
  'Auto':     [1.1, 1.2, 1.3],
  'Moto':     [1.4, 1.5, 1.6],
  'Agro':     [0.6, 0.7, 0.8],
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

// Escolhe um produto compatível com o porte da venda (valor total da venda)
function pickProductForSize(size: number): Product {
  if (size >= 1_200_000) return rand(['Imóvel', 'Agro'] as const);
  if (size >= 500_000) return rand(['Imóvel', 'Agro', 'Auto'] as const);
  if (size >= 200_000) return rand(['Imóvel', 'Auto', 'Serviços'] as const);
  if (size >= 80_000) return rand(['Auto', 'Moto', 'Serviços'] as const);
  return rand(['Moto', 'Serviços'] as const);
}

// Divide um valor total em N cotas com pesos aleatórios, arredondado em milhares
function splitQuotas(total: number, n: number): number[] {
  if (n <= 1) return [roundToK(total)];
  const weights = Array.from({ length: n }, () => 0.5 + Math.random());
  const sumW = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => roundToK((w / sumW) * total));
  const diff = total - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] = roundToK(parts[parts.length - 1] + diff);
  return parts.filter((p) => p > 0);
}

// --- seed dos consultores
const consultantIds: Record<string, number> = {};
for (const c of consultants) {
  const existing = db
    .prepare('SELECT id FROM consultants WHERE LOWER(name)=LOWER(?)')
    .get(c.name) as { id: number } | undefined;
  if (existing) {
    consultantIds[c.name] = existing.id;
    db.prepare('UPDATE consultants SET email=?, monthly_target=? WHERE id=?').run(
      c.email,
      c.monthly_target,
      existing.id
    );
  } else {
    const info = db
      .prepare('INSERT INTO consultants (name,email,active,monthly_target) VALUES (?,?,1,?)')
      .run(c.name, c.email, c.monthly_target);
    consultantIds[c.name] = Number(info.lastInsertRowid);
    console.log(
      `  + consultor: ${c.name} (meta R$ ${c.monthly_target.toLocaleString('pt-BR')})`
    );
  }
}

const salesCount = db.prepare('SELECT COUNT(*) c FROM sales').get() as { c: number };
if (salesCount.c > 0 && !RESET) {
  console.log(
    `[seed] já existem ${salesCount.c} vendas — pulando. Rode com -- --reset pra regerar.`
  );
  db.close();
  process.exit(0);
}

let clientNum = 7001;

function createSale(
  consultantName: string,
  saleDate: string,
  size: number
) {
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

  const info = db
    .prepare(
      `INSERT INTO sales (
        consultant_id, consultant_name, client_number, client_name, product, sale_date,
        insurance, base_value, quotas, unit_value, commission_percentage, total_commission, group_quota
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
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
      groupQuota
    );
  const saleId = Number(info.lastInsertRowid);
  quotas.forEach((v, qi) =>
    db
      .prepare('INSERT INTO sale_quotas (sale_id,number,value) VALUES (?,?,?)')
      .run(saleId, qi + 1, v)
  );
  const built = buildInstallments(totalCommission, saleDate, 6);
  for (const b of built) {
    db.prepare(
      'INSERT INTO installments (sale_id,number,value,due_date) VALUES (?,?,?,?)'
    ).run(saleId, b.number, b.value, b.due_date);
  }
}

// Distribui `revenue` total em `count` vendas com variância grande (±60%)
// pra criar tamanhos diferentes (algumas vendas pequenas, algumas grandes)
function distributeRevenue(revenue: number, count: number): number[] {
  const weights = Array.from({ length: count }, () => 0.4 + Math.random() * 1.6);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => roundToK((w / sumW) * revenue));
  const diff = revenue - sizes.reduce((a, b) => a + b, 0);
  sizes[sizes.length - 1] = roundToK(Math.max(40_000, sizes[sizes.length - 1] + diff));
  return sizes;
}

// Peso por dia-da-semana: Dom..Sáb. Consórcio quase não vende fim de semana.
const dowWeight = [0.15, 1.0, 1.25, 1.35, 1.4, 1.05, 0.35];

// Constrói pesos para cada dia do mês considerando:
//  - dia-da-semana (qua/qui são pico, sab/dom afundam)
//  - bias de fim de mês (correria pra bater meta)
//  - ruído aleatório (alguns dias quentes, alguns frios)
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

// Sazonalidade do ano (12 multiplicadores, index 0 = 11 meses atrás → 11 = mês corrente).
// Conta uma narrativa: começo morno → cresce → pico de fim de ano → ressaca em janeiro → recupera.
const seasonalMultiplier = [
  0.68, // M-11 — começo lento
  0.82, // M-10
  1.05, // M-9  — bombou
  0.74, // M-8  — férias / dip
  0.95, // M-7
  1.18, // M-6  — Black Friday / antecipa fim de ano
  1.30, // M-5  — pico fim de ano
  0.62, // M-4  — ressaca de janeiro
  0.88, // M-3
  1.12, // M-2  — recuperação forte
  0.92, // M-1
  // mês corrente é tratado separadamente (alvo ~92%)
];

const today = dayjs();
const currentMonthStart = today.startOf('month');
const daysSoFar = today.date();

// --- MÊS CORRENTE: ~92% por consultor (88-96%), com bias forte de fim de mês
for (const c of consultants) {
  const pct = 0.88 + Math.random() * 0.08;
  const revenue = c.monthly_target * pct;
  const count = 5 + Math.floor(Math.random() * 4); // 5-8 vendas
  const sizes = distributeRevenue(revenue, count);
  const weights = buildDayWeights(currentMonthStart, daysSoFar, 1.0);
  for (let i = 0; i < count; i++) {
    const day = pickDayByWeight(weights);
    const saleDate = currentMonthStart.add(day, 'day').format('YYYY-MM-DD');
    createSale(c.name, saleDate, sizes[i]);
  }
}

// --- 11 MESES ANTERIORES: multiplicador sazonal × ruído por consultor
for (let m = 1; m <= 11; m++) {
  const monthStart = today.subtract(m, 'month').startOf('month');
  const daysInMonth = monthStart.daysInMonth();
  const seasonal = seasonalMultiplier[11 - m];
  for (const c of consultants) {
    const consultantNoise = 0.82 + Math.random() * 0.36; // 0.82-1.18
    const revenue = c.monthly_target * seasonal * consultantNoise;
    const count = 4 + Math.floor(Math.random() * 4); // 4-7 vendas
    const sizes = distributeRevenue(revenue, count);
    const weights = buildDayWeights(monthStart, daysInMonth, 0.8);
    for (let i = 0; i < count; i++) {
      const day = pickDayByWeight(weights);
      const saleDate = monthStart.add(day, 'day').format('YYYY-MM-DD');
      createSale(c.name, saleDate, sizes[i]);
    }
  }
}

// --- parcelas: ~80% das vencidas viram pagas, restante atrasada
db.exec(`
  UPDATE installments
  SET status='paid',
      paid_date=date(due_date, '+' || (abs(random()) % 5) || ' days')
  WHERE due_date <= date('now')
    AND (id % 10) < 8
`);
db.exec(`
  UPDATE installments
  SET bill_overdue=1
  WHERE status='pending' AND due_date < date('now')
`);

const finalCount = db.prepare('SELECT COUNT(*) c FROM sales').get() as { c: number };
const paidCount = db.prepare("SELECT COUNT(*) c FROM installments WHERE status='paid'").get() as {
  c: number;
};
const overdueCount = db
  .prepare("SELECT COUNT(*) c FROM installments WHERE bill_overdue=1")
  .get() as { c: number };

// quick sanity: % do mês corrente por consultor
const monthAch = db
  .prepare(
    `SELECT c.name, c.monthly_target, COALESCE(SUM(s.base_value),0) total
       FROM consultants c
       LEFT JOIN sales s ON s.consultant_id=c.id
                         AND s.sale_date >= date('now','start of month')
                         AND s.sale_date <= date('now')
      WHERE c.active=1
      GROUP BY c.id ORDER BY c.name`
  )
  .all() as { name: string; monthly_target: number; total: number }[];

console.log('');
console.log(`[seed] feito: ${consultants.length} consultores, ${finalCount.c} vendas`);
console.log(`        parcelas: ${paidCount.c} pagas, ${overdueCount.c} em atraso`);
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
db.close();
