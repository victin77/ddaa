export interface Tier {
  name: string;
  min: number;
  color: string;
}

export const TIERS: Tier[] = [
  { name: 'Iniciante', min: 0, color: '#94a3b8' },
  { name: 'Bronze', min: 50_000, color: '#b45309' },
  { name: 'Prata', min: 200_000, color: '#9ca3af' },
  { name: 'Ouro', min: 500_000, color: '#eab308' },
  { name: 'Platina', min: 1_000_000, color: '#22d3ee' },
  { name: 'Diamante', min: 2_500_000, color: '#60a5fa' },
  { name: 'Mestre', min: 5_000_000, color: '#a78bfa' },
  { name: 'Lenda das Vendas', min: 10_000_000, color: '#f43f5e' },
];

export function tierFor(totalSales: number): Tier {
  let current = TIERS[0];
  for (const t of TIERS) {
    if (totalSales >= t.min) current = t;
  }
  return current;
}
