export type Role = 'admin' | 'consultant';

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  consultant_id: number | null;
}

export interface Consultant {
  id: number;
  name: string;
  email: string | null;
  active: number;
  monthly_target: number;
  login_username?: string | null;
}

export interface PublicConsultant {
  id: number;
  name: string;
  username: string | null;
}

export type InstallmentStatus = 'paid' | 'pending' | 'overdue';

export interface Installment {
  id: number;
  sale_id: number;
  number: number;
  value: number;
  due_date: string;
  status: InstallmentStatus;
  bill_overdue: number;
  paid_date: string | null;
  computed_overdue?: boolean;
  cancellation_phase?: boolean;
}

export interface SaleQuota {
  id: number;
  sale_id: number;
  number: number;
  value: number;
}

export interface Sale {
  id: number;
  consultant_id: number;
  consultant_name: string;
  client_number: string | null;
  client_name: string;
  product: string;
  sale_date: string;
  insurance: number;
  base_value: number;
  quotas: number;
  unit_value: number;
  commission_percentage: number;
  total_commission: number;
  group_quota: string | null;
  created_at: string;
  updated_at: string;
  installments: Installment[];
  quotas_list: SaleQuota[];
}

export interface RankingItem {
  id: number;
  name: string;
  monthly_target: number;
  total_base: number;
  total_commission: number | null;
  sale_count: number;
  tier: string;
  tier_color: string;
}

export interface Summary {
  today: { count: number; commission: number };
  week: { count: number; base: number };
  month: { count: number; commission: number; base: number };
  prevMonth: { count: number; commission: number; base: number };
  installments: {
    paid: { count: number; total: number };
    pending: { count: number; total: number };
    overdue: { count: number; total: number };
  };
  totals: { commission: number };
  target: {
    monthly: number;
    achieved: number;
    pct: number;
    daysLeft: number;
    isAggregate: boolean;
  };
}

export interface RecebimentoRow {
  id: number;
  sale_id: number;
  number: number;
  value: number;
  due_date: string;
  status: InstallmentStatus;
  bill_overdue: number;
  paid_date: string | null;
  consultant_id: number;
  consultant_name: string;
  client_name: string;
  product: string;
}
