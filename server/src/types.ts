export type Role = 'admin' | 'consultant';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  consultant_id: number | null;
}

export interface ConsultantRow {
  id: number;
  name: string;
  email: string | null;
  active: number;
  monthly_target: number;
}

export interface SaleRow {
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
}

export type InstallmentStatus = 'paid' | 'pending' | 'overdue';

export interface InstallmentRow {
  id: number;
  sale_id: number;
  number: number;
  value: number;
  due_date: string;
  status: InstallmentStatus;
  bill_overdue: number;
  paid_date: string | null;
}

export interface SaleQuotaRow {
  id: number;
  sale_id: number;
  number: number;
  value: number;
}

export interface AuthUser {
  id: number;
  username: string;
  role: Role;
  consultant_id: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
