export type Role = "admin" | "supervisor" | "staff" | "inventory_manager";

export interface Tenant {
  id: number;
  name: string;
  slug?: string;
}

export interface Branch {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  tenant_id?: number | null;
  branch_id?: number | null;
  tenant?: Tenant | null;
  branch?: Branch | null;
  email_verified_at?: string | null;
  is_active?: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}