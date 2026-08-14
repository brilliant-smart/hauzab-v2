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

export type OrderStatusValue = "pending" | "completed" | "voided" | "credit";
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
  kind?: "instance" | "balance" | null;
  user_id?: number | null;
}

export interface Order {
  id: number;
  // Discriminant for ReceiptOrder = Order | ProvisionalOrder. Always absent on
  // a real server order; present (true) only on the offline provisional shape.
  is_provisional?: false;
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
  customer_phone?: string | null;
  legacy_meta?: Record<string, unknown> | null;
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
  device_id?: number | null;
}

/**
 * A sale recorded in the browser while offline (or mid-flight network loss).
 * Mirrors the money shape of a server Order so the receipt and history views
 * can render either through one view-model. The uuid is the dedup key: when the
 * outbox drains, the server returns the real order for that uuid and the
 * provisional row is dropped.
 */
export interface ProvisionalOrder {
  is_provisional: true;
  uuid: string;
  provisional_number: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  change: number;
  customer_name: string | null;
  items: { product_name: string; quantity: number; unit_price: number; line_total: number }[];
  payments: { method: PaymentMethodValue; amount: number }[];
  tenant?: {
    id: number;
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  user?: { id: number; name: string } | null;
  created_at: string;
}

export type ReceiptOrder = Order | ProvisionalOrder;

export interface ExpenseCategory {
  id: number;
  name: string;
  description?: string | null;
  tenant_id?: number;
  expenses_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Expense {
  id: number;
  expense_category_id?: number | null;
  user_id?: number | null;
  description: string;
  amount: string;
  date: string;
  category?: { id: number; name: string } | null;
  user?: { id: number; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductCard {
  id: number;
  date: string;
  opening: string;
  added: string;
  reversed: string;
  sold: string;
  cost_price: string;
  selling_price: string;
  closing: string;
}

export interface SalesAuditRow {
  id: number;
  date: string | null;
  product_name: string;
  product_size: string | null;
  opening: string;
  added: string;
  reversed: string;
  sold: string;
  cost_price: string;
  selling_price: string;
  amount: string;
  closing: string;
  expire_date: string | null;
  user_name: string | null;
}

export interface StaffSalesRow {
  user_id: number;
  user_name: string;
  sales_count: number;
  total: string;
}

export interface Consignment {
  id: number;
  name: string;
  description?: string | null;
  model?: string | null;
  size?: string | null;
  department?: string | null;
  category?: string | null;
  category_id?: number | null;
  quantity: string;
  unit_cost: string;
  unit_price: string;
  unit_profit: string;
  image?: string | null;
  consignment?: string | null;
  manufacture_date?: string | null;
  expire_date?: string | null;
  date?: string | null;
  barcode?: string | null;
  user?: { id: number; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  subject_type: string | null;
  subject_id: number | null;
  properties?: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  user?: { id: number; name: string } | null;
}

export interface DashboardSummary {
  today: { count: number; total: string };
  week: { count: number; total: string };
  year: { count: number; total: string };
  monthly_expense: string;
  products_count: number;
  low_stock_count: number;
  expiring_count: number;
  employees_count: number;
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "supervisor", label: "Supervisor" },
  { value: "staff", label: "Staff" },
];