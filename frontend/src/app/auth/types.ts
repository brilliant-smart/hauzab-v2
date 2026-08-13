export type Role = "admin" | "supervisor" | "staff";

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
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}