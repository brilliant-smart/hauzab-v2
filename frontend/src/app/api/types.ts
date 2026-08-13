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

export interface Customer {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at?: string;
}

export type OrderStatusValue = "pending" | "completed" | "voided";
export type PaymentMethodValue = "cash" | "pos" | "transfer";

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  barcode?: string | null;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface OrderPayment {
  id: number;
  method: { value: PaymentMethodValue; label: string };
  amount: string;
}

export interface Order {
  id: number;
  number: string;
  uuid: string;
  status: { value: OrderStatusValue; label: string };
  subtotal: string;
  discount: string;
  total: string;
  amount_paid: string;
  change: string;
  customer_id: number | null;
  customer_name: string | null;
  note: string | null;
  items: OrderItem[];
  payments: OrderPayment[];
  customer?: { id: number; name: string; phone?: string | null } | null;
  user?: { id: number; name: string } | null;
  tenant?: {
    id: number;
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  branch?: { id: number; name: string } | null;
  created_at?: string;
}

export interface CreateOrderPayload {
  uuid: string;
  items: { product_id: number; quantity: number; unit_price: number }[];
  discount?: number;
  payments: { method: PaymentMethodValue; amount: number }[];
  customer_id?: number | null;
  customer_name?: string | null;
  note?: string | null;
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "staff", label: "Staff" },
];