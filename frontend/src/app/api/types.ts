import { Role } from "@/app/auth/types";

export interface NamedResource {
  id: number;
  name: string;
  description?: string | null;
  tenant_id?: number;
  products_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ContactResource extends NamedResource {
  address?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Product {
  id: number;
  name: string;
  description?: string | null;
  size?: string | null;
  model?: string | null;
  department?: string | null;
  barcode?: string | null;
  image?: string | null;
  quantity: string;
  cost_price: string;
  selling_price: string;
  reorder_level: number;
  manufacture_date?: string | null;
  expire_date?: string | null;
  is_active: boolean;
  category_id?: number | null;
  unit_id?: number | null;
  manufacturer_id?: number | null;
  supplier_id?: number | null;
  category?: { id: number; name: string } | null;
  unit?: { id: number; name: string } | null;
  manufacturer?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  fullname?: string | null;
  gender?: string | null;
  address?: string | null;
  phone?: string | null;
  qualification?: string | null;
  designation?: string | null;
  state?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  bank_name?: string | null;
  salary?: string | null;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  tenant_id?: number | null;
  branch_id?: number | null;
  branch?: { id: number; name: string } | null;
  profile?: UserProfile | null;
  created_at?: string;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from?: number;
  to?: number;
}

export interface ListResponse<T> {
  data: T[];
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "staff", label: "Staff" },
];