import dayjs from 'dayjs';

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcCommission(baseValue: number, percentage: number) {
  return round2(baseValue * (percentage / 100));
}

export function buildInstallments(
  totalCommission: number,
  saleDate: string,
  count = 6
): { number: number; value: number; due_date: string }[] {
  const base = dayjs(saleDate);
  const perInstallment = round2(totalCommission / count);
  const list: { number: number; value: number; due_date: string }[] = [];
  let sum = 0;
  for (let i = 1; i <= count; i++) {
    const due = base.add(i, 'month').format('YYYY-MM-DD');
    let value = perInstallment;
    if (i === count) {
      value = round2(totalCommission - sum);
    } else {
      sum = round2(sum + value);
    }
    list.push({ number: i, value, due_date: due });
  }
  return list;
}

export function isOverdue(dueDate: string, status: string) {
  if (status === 'paid') return false;
  return dayjs().startOf('day').isAfter(dayjs(dueDate));
}

export function isInCancellationPhase(
  dueDate: string,
  billOverdue: boolean,
  status: string,
  daysThreshold = Number(process.env.CANCELLATION_PHASE_DAYS || 30)
) {
  if (!billOverdue) return false;
  if (status === 'paid') return false;
  const diff = dayjs().diff(dayjs(dueDate), 'day');
  return diff >= daysThreshold;
}
