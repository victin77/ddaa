import clsx from 'clsx';
import { InstallmentStatus } from '../types';

const map: Record<InstallmentStatus, { label: string; cls: string }> = {
  paid: { label: 'Pago', cls: 'bg-success/15 text-success' },
  pending: { label: 'Pendente', cls: 'bg-overlay/[0.06] text-ink' },
  overdue: { label: 'Atrasada', cls: 'bg-danger/15 text-danger' },
};

export function StatusPill({
  status,
  billOverdue,
}: {
  status: InstallmentStatus;
  billOverdue?: boolean;
}) {
  if (billOverdue && status !== 'paid') {
    return <span className="pill bg-warn/15 text-warn">Boleto atrasado</span>;
  }
  const m = map[status];
  return (
    <span className={clsx('pill', m.cls)}>
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          status === 'paid' && 'bg-success',
          status === 'pending' && 'bg-ink',
          status === 'overdue' && 'bg-danger'
        )}
      />
      {m.label}
    </span>
  );
}

export function TierPill({ name, color }: { name: string; color: string }) {
  return (
    <span className="pill" style={{ background: `${color}26`, color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
