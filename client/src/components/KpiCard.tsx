import { ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  label: string;
  hint?: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  delta?: ReactNode;
  trend?: { current: number; previous: number; label?: string };
  highlight?: boolean;
  footer?: ReactNode;
  onClick?: () => void;
}

function formatTrendPct(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return { pct: 0, dir: 'flat' as const };
    return { pct: 100, dir: 'up' as const };
  }
  const diff = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(diff) < 0.5) return { pct: 0, dir: 'flat' as const };
  return { pct: Math.round(diff), dir: diff > 0 ? ('up' as const) : ('down' as const) };
}

export default function KpiCard({
  label,
  hint,
  value,
  icon,
  delta,
  trend,
  highlight,
  footer,
  onClick,
}: Props) {
  const Wrapper: any = onClick ? 'button' : 'div';
  const trendInfo = trend ? formatTrendPct(trend.current, trend.previous) : null;
  return (
    <Wrapper
      onClick={onClick}
      className={clsx(
        'p-5 flex flex-col gap-4 relative overflow-hidden rounded-3xl text-left w-full transition',
        highlight ? 'card-orange' : 'surface',
        onClick && (highlight ? 'hover:brightness-110' : 'hover:bg-bg-elev/40')
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl grid place-items-center shrink-0',
            highlight ? 'bg-white/20 text-white' : 'bg-bg-elev text-ink'
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div
            className={clsx(
              'text-sm font-semibold truncate',
              highlight ? 'text-white' : 'text-ink'
            )}
          >
            {label}
          </div>
          {hint && (
            <div
              className={clsx(
                'text-[11px] mt-0.5 truncate',
                highlight ? 'text-white/80' : 'text-muted'
              )}
            >
              {hint}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div
          className={clsx(
            'text-[28px] sm:text-[32px] font-extrabold tracking-tight leading-none break-words',
            highlight ? 'text-white' : 'text-ink'
          )}
        >
          {value}
        </div>
        {trendInfo && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md mb-0.5 tabular-nums',
              highlight
                ? 'bg-white/20 text-white'
                : trendInfo.dir === 'up'
                ? 'bg-success/15 text-success'
                : trendInfo.dir === 'down'
                ? 'bg-danger/15 text-danger'
                : 'bg-overlay/[0.06] text-muted'
            )}
            title={trend?.label ?? 'vs mês anterior'}
          >
            {trendInfo.dir === 'up' && <TrendingUp className="w-3 h-3" />}
            {trendInfo.dir === 'down' && <TrendingDown className="w-3 h-3" />}
            {trendInfo.dir === 'flat' && <Minus className="w-3 h-3" />}
            {trendInfo.dir === 'flat' ? 'estável' : `${trendInfo.pct > 0 ? '+' : ''}${trendInfo.pct}%`}
          </span>
        )}
        {!trendInfo && delta && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md mb-0.5',
              highlight ? 'bg-white/20 text-white' : 'bg-success/15 text-success'
            )}
          >
            {delta}
          </span>
        )}
      </div>

      {(footer || onClick) && (
        <div
          className={clsx(
            'mt-1 -mb-1 flex items-center justify-between text-sm pt-3 border-t',
            highlight ? 'border-white/15 text-white' : 'border-overlay/[0.05] text-muted'
          )}
        >
          <span>{footer || 'Ver detalhes'}</span>
          {onClick && <ArrowUpRight className="w-4 h-4" />}
        </div>
      )}
    </Wrapper>
  );
}
