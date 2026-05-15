import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { api, formatBRL, formatDate } from '../api';
import { useAuth } from '../auth';
import {
  PublicConsultant,
  RankingItem,
  RecebimentoRow,
  Sale,
  Summary,
} from '../types';
import KpiCard from '../components/KpiCard';
import MetaCardWave from '../components/MetaCardWave';
import { CashFlowBar, InstallmentsDonut } from '../components/Charts';
import { StatusPill, TierPill } from '../components/StatusPill';
import {
  CircleDollarSign,
  Download,
  HandCoins,
  Plus,
  RefreshCcw,
  Target,
  Wallet,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [consultants, setConsultants] = useState<PublicConsultant[]>([]);
  const [recebimentos, setRecebimentos] = useState<RecebimentoRow[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [filterConsultant, setFilterConsultant] = useState<string>('');
  const [cashRange, setCashRange] = useState<'weekly' | 'monthly' | 'yearly'>('weekly');
  const [cashMode, setCashMode] = useState<'commission' | 'sales'>('commission');

  const reload = () => {
    api.get('/summary').then((r) => setSummary(r.data));
    api.get('/ranking').then((r) => setRanking(r.data));
    api.get('/public/consultants').then((r) => setConsultants(r.data));
    api.get('/sales').then((r) => setSales(r.data));
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    const q = new URLSearchParams({ month });
    if (filterConsultant) q.set('consultant_id', filterConsultant);
    api.get(`/recebimentos?${q.toString()}`).then((r) => setRecebimentos(r.data));
  }, [month, filterConsultant]);

  const cashFlow = useMemo(() => {
    const metric = (s: Sale) => (cashMode === 'sales' ? s.base_value : s.total_commission);
    if (cashRange === 'yearly') {
      const byMonth: Record<string, number> = {};
      sales.forEach((s) => {
        const k = dayjs(s.sale_date).format('MMM/YY');
        byMonth[k] = (byMonth[k] || 0) + metric(s);
      });
      const months = Array.from({ length: 12 }).map((_, i) =>
        dayjs().subtract(11 - i, 'month').format('MMM/YY')
      );
      return months.map((m) => ({ label: m.split('/')[0], value: byMonth[m] || 0 }));
    }
    if (cashRange === 'monthly') {
      const byWeek: Record<number, number> = {};
      const today = dayjs().endOf('day');
      sales.forEach((s) => {
        const daysAgo = today.diff(dayjs(s.sale_date).startOf('day'), 'day');
        if (daysAgo >= 0 && daysAgo < 28) {
          const weekIdx = Math.floor(daysAgo / 7);
          byWeek[weekIdx] = (byWeek[weekIdx] || 0) + metric(s);
        }
      });
      return [3, 2, 1, 0].map((idx) => ({
        label: `Sem ${4 - idx}`,
        value: byWeek[idx] || 0,
      }));
    }
    const byDay: Record<string, number> = {};
    sales.forEach((s) => {
      const k = dayjs(s.sale_date).format('YYYY-MM-DD');
      byDay[k] = (byDay[k] || 0) + metric(s);
    });
    const days = Array.from({ length: 7 }).map((_, i) =>
      dayjs().subtract(6 - i, 'day').format('YYYY-MM-DD')
    );
    return days.map((d) => ({
      label: dayjs(d).format('ddd'),
      value: byDay[d] || 0,
    }));
  }, [sales, cashRange, cashMode]);

  const totalCashflow = useMemo(() => cashFlow.reduce((s, d) => s + d.value, 0), [cashFlow]);

  const topConsultants = useMemo(() => ranking.slice(0, 4), [ranking]);

  const payByConsultant = useMemo(() => {
    const grouped = new Map<
      number,
      {
        id: number;
        name: string;
        pending: number;
        paid: number;
        overdue: number;
        total: number;
        countPending: number;
        countPaid: number;
        countTotal: number;
      }
    >();
    recebimentos.forEach((r) => {
      const key = r.consultant_id;
      const entry =
        grouped.get(key) ?? {
          id: key,
          name: r.consultant_name,
          pending: 0,
          paid: 0,
          overdue: 0,
          total: 0,
          countPending: 0,
          countPaid: 0,
          countTotal: 0,
        };
      entry.total += r.value;
      entry.countTotal += 1;
      if (r.status === 'paid') {
        entry.paid += r.value;
        entry.countPaid += 1;
      } else {
        entry.pending += r.value;
        entry.countPending += 1;
        if (r.status === 'overdue' || r.bill_overdue) entry.overdue += r.value;
      }
      grouped.set(key, entry);
    });
    return Array.from(grouped.values()).sort((a, b) => b.pending - a.pending);
  }, [recebimentos]);

  const payTotals = useMemo(
    () =>
      payByConsultant.reduce(
        (acc, c) => ({
          pending: acc.pending + c.pending,
          paid: acc.paid + c.paid,
          overdue: acc.overdue + c.overdue,
          total: acc.total + c.total,
        }),
        { pending: 0, paid: 0, overdue: 0, total: 0 }
      ),
    [payByConsultant]
  );

  if (!summary) return <div className="text-muted">Carregando…</div>;

  const prevMonth = summary.prevMonth ?? { count: 0, commission: 0, base: 0 };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="h-page">Visão geral</h1>
          <p className="text-sm text-muted mt-1">
            Resumo de hoje · {dayjs().format('DD [de] MMMM, YYYY')}
            {isAdmin ? ' · Todos os consultores' : ' · Seus números'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" onClick={reload}>
            <RefreshCcw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          highlight
          label="Comissão do mês"
          hint={`Acumulado: ${formatBRL(summary.totals.commission)}`}
          icon={<CircleDollarSign className="w-5 h-5" />}
          value={formatBRL(summary.month.commission)}
          trend={{
            current: summary.month.commission,
            previous: prevMonth.commission,
            label: 'vs mês anterior',
          }}
          footer="Ver vendas"
          onClick={() => navigate('/vendas')}
        />
        <KpiCard
          label="Vendas do mês"
          hint={`${summary.month.count} fechadas`}
          icon={<HandCoins className="w-5 h-5" />}
          value={formatBRL(summary.month.base)}
          trend={{
            current: summary.month.base,
            previous: prevMonth.base,
            label: 'vs mês anterior',
          }}
          footer="Ver vendas do mês"
          onClick={() => navigate('/vendas')}
        />
        <KpiCard
          label="Pendente / Atrasado"
          hint={`${summary.installments.overdue.count} em atraso`}
          icon={<Wallet className="w-5 h-5" />}
          value={formatBRL(summary.installments.pending.total + summary.installments.overdue.total)}
          delta={`${summary.installments.pending.count} pendentes`}
          footer="Ver atrasos"
          onClick={() => navigate('/vendas?q=atraso')}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-2 flex flex-col gap-4">
          <div className="card">
            <div className="flex items-start justify-between mb-4 gap-2">
              <div className="min-w-0">
                <h3 className="h-section">Top consultores</h3>
                <p className="text-xs text-muted mt-0.5">
                  Ranking dos melhores deste mês
                </p>
              </div>
              <button
                className="btn-primary text-xs py-1.5 px-3"
                onClick={() => navigate('/vendas?new=1')}
              >
                <Plus className="w-3 h-3" /> Nova venda
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topConsultants.map((c, i) => {
                const target = c.monthly_target ?? 0;
                const hasTarget = target > 0;
                const pct = hasTarget
                  ? Math.min(100, (c.total_base / target) * 100)
                  : 0;
                const hitTarget = hasTarget && c.total_base >= target;
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate('/ranking')}
                    className="card-soft p-4 flex flex-col gap-2 border border-overlay/[0.04] text-left hover:bg-overlay/[0.04] transition"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full grid place-items-center text-xs font-bold shrink-0"
                        style={{ background: `${c.tier_color}33`, color: c.tier_color }}
                      >
                        #{i + 1}
                      </div>
                      <div className="text-sm font-semibold truncate">{c.name.split(' ')[0]}</div>
                    </div>
                    <div className="text-lg font-extrabold tracking-tight truncate">
                      {formatBRL(c.total_base)}
                    </div>
                    {hasTarget && (
                      <div className="flex flex-col gap-1">
                        <div className="h-1.5 rounded-full bg-overlay/[0.06] overflow-hidden">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-[width] duration-500 ease-out',
                              hitTarget ? 'bg-success' : 'bg-accent'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Meta {formatBRL(target)}
                          </span>
                          <span
                            className={clsx(
                              'font-semibold tabular-nums',
                              hitTarget ? 'text-success' : 'text-accent'
                            )}
                          >
                            {Math.round(pct)}%
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] text-muted">{c.sale_count} vendas</span>
                      <TierPill name={c.tier} color={c.tier_color} />
                    </div>
                  </button>
                );
              })}
              {topConsultants.length === 0 && (
                <div className="col-span-full text-sm text-muted py-6 text-center">
                  Sem dados ainda.
                </div>
              )}
            </div>
          </div>

          <MetaCardWave
            pct={summary.target.pct}
            achieved={summary.target.achieved}
            monthly={summary.target.monthly}
            daysLeft={summary.target.daysLeft}
            isAggregate={summary.target.isAggregate}
            onClick={() => navigate('/ranking')}
          />
        </div>

        <div className="xl:col-span-3">
          <CashFlowBar
            data={cashFlow}
            total={totalCashflow}
            modeOptions={[
              { value: 'commission', label: 'Fluxo de comissão' },
              { value: 'sales', label: 'Fluxo de vendas' },
            ]}
            modeValue={cashMode}
            onModeChange={(v) => setCashMode(v as 'commission' | 'sales')}
            toggleOptions={[
              { value: 'weekly', label: 'Semana' },
              { value: 'monthly', label: 'Mês' },
              { value: 'yearly', label: 'Ano' },
            ]}
            toggleValue={cashRange}
            onToggle={(v) => setCashRange(v as any)}
          />
        </div>
      </div>

      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="h-section">A pagar por consultor</h3>
            <p className="text-xs text-muted mt-0.5">
              Comissões com vencimento em {dayjs(month + '-01').format('MMMM/YY')}
            </p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">A liquidar</div>
              <div className="text-2xl font-extrabold text-accent leading-none mt-1 tabular-nums">
                {formatBRL(payTotals.pending)}
              </div>
            </div>
            <div className="h-9 w-px bg-overlay/[0.08]" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">Já pago</div>
              <div className="text-lg font-semibold text-success leading-none mt-1 tabular-nums">
                {formatBRL(payTotals.paid)}
              </div>
            </div>
            {isAdmin && payByConsultant.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const r = await api.get(`/export/folha-comissao?month=${month}`, {
                      responseType: 'blob',
                    });
                    const ct = String(r.headers['content-type'] || '');
                    if (!ct.includes('spreadsheetml') && !ct.includes('octet-stream')) {
                      const text = await (r.data as Blob).text();
                      throw new Error(
                        `Servidor não retornou XLSX (content-type=${ct}). Resposta: ${text.slice(0, 200)}`
                      );
                    }
                    const blob = new Blob([r.data], {
                      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `folha-comissao-${month}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (e: any) {
                    alert(
                      'Erro ao baixar folha: ' +
                        (e?.response?.data?.error || e?.message || 'desconhecido')
                    );
                  }
                }}
                className="btn-ghost"
                title="Baixar folha de comissão em Excel"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Folha XLSX</span>
              </button>
            )}
          </div>
        </div>

        {payByConsultant.length === 0 ? (
          <div className="text-sm text-muted text-center py-8">
            Nenhuma comissão a pagar neste mês.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {payByConsultant.map((c) => {
              const pct = c.total > 0 ? (c.paid / c.total) * 100 : 0;
              const hasOverdue = c.overdue > 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    if (isAdmin) setFilterConsultant(String(c.id));
                  }}
                  className={clsx(
                    'card-soft p-4 text-left flex flex-col gap-3 border transition',
                    hasOverdue
                      ? 'border-danger/30 hover:border-danger/50'
                      : 'border-overlay/[0.04] hover:border-accent/30',
                    isAdmin && 'cursor-pointer'
                  )}
                  aria-label={`Filtrar recebimentos de ${c.name}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted uppercase tracking-wider">
                        A pagar
                      </div>
                      <div className="text-2xl font-extrabold text-accent leading-none mt-1 tabular-nums truncate">
                        {formatBRL(c.pending)}
                      </div>
                    </div>
                    {hasOverdue && (
                      <span className="pill bg-danger/15 text-danger text-[10px] shrink-0">
                        {formatBRL(c.overdue)} atraso
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-bg-elev grid place-items-center text-[10px] font-bold uppercase text-ink shrink-0">
                      {c.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <div className="text-sm font-medium truncate">{c.name}</div>
                  </div>

                  <div>
                    <div className="h-1.5 rounded-full bg-overlay/[0.06] overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted mt-1.5">
                      <span>
                        {c.countPaid} de {c.countTotal} parcelas pagas
                      </span>
                      <span className="tabular-nums">{Math.round(pct)}%</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <InstallmentsDonut
          paid={summary.installments.paid.count}
          pending={summary.installments.pending.count}
          overdue={summary.installments.overdue.count}
        />
        <div className="xl:col-span-2 card">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="h-section">Recebimentos do mês</h3>
              <p className="text-xs text-muted mt-0.5">Parcelas com vencimento no período</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="input w-40"
              />
              {isAdmin && (
                <select
                  className="input w-48"
                  value={filterConsultant}
                  onChange={(e) => setFilterConsultant(e.target.value)}
                >
                  <option value="">Todos consultores</option>
                  {consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">Atividade</th>
                  <th className="table-th">Consultor</th>
                  <th className="table-th">Vencimento</th>
                  <th className="table-th">Valor</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {recebimentos.slice(0, 8).map((r) => (
                  <tr key={r.id} className="table-row hover:bg-overlay/[0.02]">
                    <td className="table-td">
                      <div className="font-medium">{r.client_name}</div>
                      <div className="text-xs text-muted">
                        {r.product} · parcela {r.number}ª
                      </div>
                    </td>
                    <td className="table-td text-muted">{r.consultant_name}</td>
                    <td className="table-td text-muted">{formatDate(r.due_date)}</td>
                    <td className="table-td font-semibold">{formatBRL(r.value)}</td>
                    <td className="table-td">
                      <StatusPill status={r.status} billOverdue={!!r.bill_overdue} />
                    </td>
                  </tr>
                ))}
                {recebimentos.length === 0 && (
                  <tr>
                    <td className="table-td text-center text-muted" colSpan={5}>
                      Nenhum recebimento neste mês.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
