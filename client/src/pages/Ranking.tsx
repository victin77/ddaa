import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api, formatBRL } from '../api';
import { RankingItem } from '../types';
import { TierPill } from '../components/StatusPill';
import { Trophy } from 'lucide-react';

export default function Ranking() {
  const [data, setData] = useState<RankingItem[]>([]);
  const [start, setStart] = useState(dayjs().startOf('year').format('YYYY-MM-DD'));
  const [end, setEnd] = useState(dayjs().endOf('day').format('YYYY-MM-DD'));

  useEffect(() => {
    api.get(`/ranking?start=${start}&end=${end}`).then((r) => setData(r.data));
  }, [start, end]);

  const podium = data.slice(0, 3);
  const rest = data.slice(3);
  const max = data[0]?.total_base || 1;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted uppercase tracking-wider">Ranking</div>
          <h1 className="text-3xl font-bold tracking-tight mt-1">Quem está vendendo mais</h1>
          <p className="text-sm text-muted mt-1">
            Ranking gamificado por volume vendido no período
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="label">De</label>
            <input
              type="date"
              className="input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Até</label>
            <input
              type="date"
              className="input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
      </header>

      {podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 0, 2].map((idx) => {
            const c = podium[idx];
            if (!c) return <div key={idx} />;
            const isFirst = idx === 0;
            return (
              <div
                key={c.id}
                className={`card p-5 relative overflow-hidden ${
                  isFirst ? 'md:-translate-y-2 border-accent/40 shadow-glow' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy
                      className="w-5 h-5"
                      style={{ color: idx === 0 ? '#eab308' : idx === 1 ? '#cbd5e1' : '#b45309' }}
                    />
                    <span className="text-2xl font-extrabold">#{idx + 1}</span>
                  </div>
                  <TierPill name={c.tier} color={c.tier_color} />
                </div>
                <div className="text-lg font-semibold">{c.name}</div>
                <div className="text-xs text-muted mt-0.5">{c.sale_count} vendas</div>
                <div className="mt-4 text-2xl font-bold tracking-tight">
                  {formatBRL(c.total_base)}
                </div>
                {c.total_commission !== null && (
                  <div className="text-xs text-muted mt-1">
                    Comissão: {formatBRL(c.total_commission)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-2">
        {rest.map((c, i) => {
          const pct = (c.total_base / max) * 100;
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-overlay/[0.03]"
            >
              <div className="w-8 text-sm text-muted text-center">#{i + 4}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{c.name}</span>
                  <TierPill name={c.tier} color={c.tier_color} />
                </div>
                <div className="relative h-1.5 mt-2 rounded-full bg-bg-elev overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-purple-500"
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatBRL(c.total_base)}</div>
                <div className="text-xs text-muted">{c.sale_count} vendas</div>
              </div>
            </div>
          );
        })}
        {rest.length === 0 && data.length <= 3 && (
          <div className="text-sm text-muted px-3 py-4">Sem mais consultores nesse período.</div>
        )}
      </div>
    </div>
  );
}
