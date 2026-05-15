import { useEffect, useRef, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { formatBRL } from '../api';
import clsx from 'clsx';

const COLORS = {
  paid: '#22c55e',
  pending: '#ff4d1f',
  overdue: '#ef4444',
};

export function InstallmentsDonut({
  paid,
  pending,
  overdue,
}: {
  paid: number;
  pending: number;
  overdue: number;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const data = [
    { name: 'Pagas', value: paid, key: 'paid' },
    { name: 'Pendentes', value: pending, key: 'pending' },
    { name: 'Atrasadas', value: overdue, key: 'overdue' },
  ];
  const total = paid + pending + overdue;
  const active = hoverKey ? data.find((d) => d.key === hoverKey) : null;

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="h-section">Status das parcelas</h3>
          <p className="text-xs text-muted mt-0.5">Carteira atual</p>
        </div>
      </div>
      <div className="flex items-center gap-6 mt-4">
        <div className="relative w-40 h-40 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={3}
                stroke="none"
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {data.map((d) => (
                  <Cell
                    key={d.key}
                    fill={COLORS[d.key as keyof typeof COLORS]}
                    style={{
                      transition:
                        'opacity 420ms cubic-bezier(0.22,1,0.36,1), filter 420ms cubic-bezier(0.22,1,0.36,1), transform 420ms cubic-bezier(0.22,1,0.36,1)',
                      transformOrigin: '50% 50%',
                      transform: hoverKey === d.key ? 'scale(1.06)' : 'scale(1)',
                      opacity: hoverKey && hoverKey !== d.key ? 0.28 : 1,
                      filter:
                        hoverKey === d.key
                          ? 'brightness(1.18) drop-shadow(0 4px 14px rgba(255,77,31,0.35))'
                          : 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoverKey(d.key)}
                    onMouseLeave={() => setHoverKey(null)}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="text-center transition-all duration-300">
              <div className="text-2xl font-extrabold tabular-nums">
                {active ? active.value : total}
              </div>
              <div className="text-[10px] text-muted uppercase tracking-wider">
                {active ? active.name.toLowerCase() : 'parcelas'}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-2.5">
          {data.map((d) => {
            const pct = total ? Math.round((d.value / total) * 100) : 0;
            const dim = hoverKey && hoverKey !== d.key;
            return (
              <button
                type="button"
                key={d.key}
                onMouseEnter={() => setHoverKey(d.key)}
                onMouseLeave={() => setHoverKey(null)}
                className={clsx(
                  'flex items-center gap-3 text-sm rounded-lg px-1 py-1 -mx-1 transition-opacity duration-200',
                  dim ? 'opacity-40' : 'opacity-100'
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform"
                  style={{
                    background: COLORS[d.key as keyof typeof COLORS],
                    transform: hoverKey === d.key ? 'scale(1.4)' : 'scale(1)',
                  }}
                />
                <span className="flex-1 text-ink text-left">{d.name}</span>
                <span className="text-muted text-xs tabular-nums">{d.value}</span>
                <span className="text-xs font-semibold text-ink w-9 text-right tabular-nums">
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CashFlowEntry {
  label: string;
  value: number;
  meta?: Record<string, number>;
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  if (n <= 1) return exp;
  if (n <= 2) return 2 * exp;
  if (n <= 5) return 5 * exp;
  return 10 * exp;
}

function formatCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return `R$ ${v.toFixed(0)}`;
}

function useAnimatedNumber(target: number, duration = 520) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    fromRef.current = value;
    startRef.current = performance.now();
    const from = fromRef.current;
    const to = target;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}

export function CashFlowBar({
  data,
  title = 'Fluxo de comissão',
  subtitle,
  total,
  toggleOptions,
  toggleValue,
  onToggle,
  modeOptions,
  modeValue,
  onModeChange,
}: {
  data: CashFlowEntry[];
  title?: string;
  subtitle?: string;
  total?: number;
  toggleOptions?: { value: string; label: string }[];
  toggleValue?: string;
  onToggle?: (v: string) => void;
  modeOptions?: { value: string; label: string }[];
  modeValue?: string;
  onModeChange?: (v: string) => void;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const maxRaw = Math.max(...data.map((d) => d.value), 0);
  const max = niceMax(maxRaw || 1);
  const highlightIdx = hoverIdx ?? Math.max(0, data.length - 1);
  const highlight = data[highlightIdx];
  const animatedTotal = useAnimatedNumber(total ?? 0);

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }).map((_, i) => (max / ticks) * (ticks - i));

  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          {modeOptions ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              {modeOptions.map((m, i) => (
                <span key={m.value} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted/40 text-xs">·</span>}
                  <button
                    type="button"
                    onClick={() => onModeChange?.(m.value)}
                    className={clsx(
                      'text-sm font-medium transition-colors',
                      modeValue === m.value ? 'text-ink' : 'text-muted hover:text-ink'
                    )}
                  >
                    {m.label}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <h3 className="text-sm text-muted">{title}</h3>
          )}
          {total !== undefined ? (
            <div className="mt-1 text-[28px] sm:text-[34px] font-extrabold tracking-tight leading-none tabular-nums">
              {formatBRL(animatedTotal)}
            </div>
          ) : subtitle ? (
            <p className="text-xs text-muted mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        {toggleOptions && (
          <div
            className="relative grid p-1 rounded-full bg-bg-elev"
            style={{ gridTemplateColumns: `repeat(${toggleOptions.length}, minmax(0, 1fr))` }}
          >
            <span
              aria-hidden
              className="absolute top-1 bottom-1 left-1 rounded-full bg-accent shadow-glow transition-transform duration-300 ease-out"
              style={{
                width: `calc((100% - 8px) / ${toggleOptions.length})`,
                transform: `translateX(${
                  Math.max(0, toggleOptions.findIndex((o) => o.value === toggleValue)) * 100
                }%)`,
              }}
            />
            {toggleOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onToggle?.(o.value)}
                className={clsx(
                  'relative z-10 px-3 py-1 text-xs rounded-full font-medium transition-colors text-center whitespace-nowrap',
                  toggleValue === o.value ? 'text-white' : 'text-muted hover:text-ink'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3 flex-1 min-h-[260px]">
        <div className="flex flex-col justify-between text-[11px] text-muted py-1 select-none">
          {tickValues.map((t, i) => (
            <span key={i} className="leading-none">
              {formatCompact(t)}
            </span>
          ))}
        </div>

        <div className="flex-1 relative">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {tickValues.map((_, i) => (
              <div
                key={i}
                className="w-full border-t border-dashed border-overlay/[0.05] h-0"
              />
            ))}
          </div>

          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2">
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              const isHi = i === highlightIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onFocus={() => setHoverIdx(i)}
                  onBlur={() => setHoverIdx(null)}
                  className="flex-1 relative h-full flex items-end group"
                  aria-label={`${d.label}: ${formatBRL(d.value)}`}
                >
                  <div
                    className="relative w-full transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{ height: `${Math.max(h, 3)}%` }}
                  >
                    <div
                      className={clsx(
                        'absolute inset-0 rounded-xl will-change-[opacity,transform] origin-bottom',
                        'transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        'bg-overlay/[0.05] group-hover:bg-overlay/[0.10]',
                        isHi ? 'opacity-0 scale-y-95' : 'opacity-100 scale-y-100'
                      )}
                    />
                    <div
                      className={clsx(
                        'absolute inset-0 rounded-xl will-change-[opacity,transform] origin-bottom',
                        'transition-[opacity,transform,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                        'bg-orange-card',
                        isHi ? 'opacity-100 scale-y-100 shadow-glow' : 'opacity-0 scale-y-95'
                      )}
                    />
                  </div>
                  {isHi && d.value > 0 && (
                    <div
                      className="absolute z-20 pointer-events-none"
                      style={{
                        left: '50%',
                        bottom: `calc(${Math.max(h, 3)}% + 12px)`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <div className="anim-pop relative">
                        <div className="surface px-3 py-2 text-[11px] whitespace-nowrap border border-overlay/[0.06]">
                          <div className="text-muted">{d.label}</div>
                          <div className="font-bold text-ink text-sm leading-tight">
                            {formatBRL(d.value)}
                          </div>
                        </div>
                        <div className="w-2.5 h-2.5 rounded-full bg-white border-[3px] border-accent absolute -bottom-1 left-1/2 -translate-x-1/2" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 sm:gap-2 mt-2 pl-[44px]">
        {data.map((d, i) => (
          <span
            key={d.label + i + 'lbl'}
            className={clsx(
              'flex-1 text-center text-[11px]',
              i === highlightIdx ? 'text-ink font-semibold' : 'text-muted'
            )}
          >
            {d.label}
          </span>
        ))}
      </div>

      {highlight && (
        <div className="mt-4 pt-4 border-t border-overlay/[0.05] flex items-center justify-between text-xs">
          <span className="text-muted">Maior valor no período</span>
          <span className="font-bold text-ink">{formatBRL(highlight.value)}</span>
        </div>
      )}
    </div>
  );
}

export function RankingBar({
  data,
}: {
  data: { name: string; total_base: number; tier_color: string }[];
}) {
  const top = data.slice(0, 8);
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="h-section">Ranking de vendas</h3>
          <p className="text-xs text-muted mt-0.5">Volume por consultor</p>
        </div>
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={top} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff9e6b" stopOpacity={1} />
                <stop offset="100%" stopColor="#ff4d1f" stopOpacity={0.85} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
              tickFormatter={(v) => (v.length > 10 ? v.split(' ')[0] : v)}
            />
            <YAxis
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,77,31,0.06)' }}
              contentStyle={{
                background: '#171717',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                color: '#fff',
                fontSize: 12,
              }}
              formatter={(v: number) => formatBRL(v)}
            />
            <Bar dataKey="total_base" fill="url(#barGrad)" radius={[10, 10, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ProductStatLine({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <div className="card flex flex-col h-full">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="h-section">Estatística por produto</h3>
          <p className="text-xs text-muted mt-0.5">Vendas acumuladas</p>
        </div>
      </div>
      <div style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ff4d1f" />
                <stop offset="100%" stopColor="#ff9e6b" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#737373', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <Tooltip
              contentStyle={{
                background: '#171717',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                color: '#fff',
                fontSize: 12,
              }}
              formatter={(v: number) => formatBRL(v)}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="url(#lineGrad)"
              strokeWidth={3}
              dot={{ r: 4, fill: '#ff4d1f', strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
