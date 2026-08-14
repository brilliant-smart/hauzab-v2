import { useState } from "react";
import { Printer } from "lucide-react";
import { Order, ProvisionalOrder, ReceiptOrder, PaymentMethodValue } from "@/app/api/types";
import { formatCurrency } from "@/app/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ReceiptFormat = "58mm" | "80mm" | "a4";

const FORMAT_CONFIG: Record<
  ReceiptFormat,
  { width: string; page: string; font: number; padding: string }
> = {
  "58mm": { width: "58mm", page: "58mm auto", font: 11, padding: "2mm" },
  "80mm": { width: "80mm", page: "80mm auto", font: 12, padding: "3mm" },
  a4: { width: "210mm", page: "A4", font: 14, padding: "12mm" },
};

function money(value: string | number | null | undefined): string {
  return formatCurrency(value);
}

/** Normalized receipt shape so a server Order and an offline ProvisionalOrder
 * render through one body. */
interface ReceiptVM {
  number: string;
  isProvisional: boolean;
  createdAt: string;
  cashierName: string | null;
  customerName: string | null;
  tenant: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  items: { name: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  payments: { method: PaymentMethodValue; amount: number }[];
  amountPaid: number;
  change: number;
  statusLabel: string;
}

function toVM(order: ReceiptOrder): ReceiptVM {
  if (order.is_provisional) {
    const p = order as ProvisionalOrder;
    return {
      number: p.provisional_number,
      isProvisional: true,
      createdAt: p.created_at,
      cashierName: p.user?.name ?? null,
      customerName: p.customer_name,
      tenant: p.tenant ?? null,
      items: p.items.map((i) => ({
        name: i.product_name,
        qty: i.quantity,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
      })),
      subtotal: p.subtotal,
      discount: p.discount,
      total: p.total,
      payments: p.payments,
      amountPaid: p.amount_paid,
      change: p.change,
      statusLabel: "Pending sync",
    };
  }
  const o = order as Order;
  return {
    number: o.number,
    isProvisional: false,
    createdAt: o.created_at ?? new Date().toISOString(),
    cashierName: o.user?.name ?? null,
    customerName: o.customer_name,
    tenant: o.tenant ?? null,
    items: o.items.map((i) => ({
      name: i.product_name,
      qty: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      lineTotal: Number(i.line_total),
    })),
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    total: Number(o.total),
    payments: o.payments.map((p) => ({ method: p.method.value, amount: Number(p.amount) })),
    amountPaid: Number(o.amount_paid),
    change: Number(o.change),
    statusLabel: o.status.label,
  };
}

/** Printable receipt body. Matches the old Hauzab thermal layout. */
function ReceiptBody({ vm, format }: { vm: ReceiptVM; format: ReceiptFormat }) {
  const cfg = FORMAT_CONFIG[format];
  const tenant = vm.tenant;
  const date = vm.createdAt ? new Date(vm.createdAt) : new Date();
  const dateStr = date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const byMethod = (method: PaymentMethodValue) =>
    vm.payments
      .filter((p) => p.method === method)
      .reduce((s, p) => s + p.amount, 0);

  return (
    <div
      id="receipt-print"
      style={{
        width: cfg.width,
        padding: cfg.padding,
        fontFamily: "ui-monospace, 'Courier New', monospace",
        fontSize: cfg.font,
        background: "white",
        color: "black",
        lineHeight: 1.45,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: cfg.font + 2 }}>
          {tenant?.name ?? "Hauzab"}
        </div>
        {tenant?.address && <div>{tenant.address}</div>}
        {(tenant?.phone || tenant?.email) && (
          <div>
            {[tenant?.phone, tenant?.email].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      <hr style={{ borderStyle: "dashed", borderWidth: 1, margin: "6px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Order</span>
        <span>{vm.number}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Date</span>
        <span>{dateStr}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Cashier</span>
        <span>{vm.cashierName ?? "—"}</span>
      </div>
      {vm.customerName && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Customer</span>
          <span>{vm.customerName}</span>
        </div>
      )}

      <hr style={{ borderStyle: "dashed", borderWidth: 1, margin: "6px 0" }} />

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ fontWeight: 700 }}>Item</th>
            <th style={{ fontWeight: 700, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {vm.items.map((item, idx) => (
            <tr key={idx} style={{ verticalAlign: "top" }}>
              <td>
                <div>{item.name}</div>
                <div style={{ opacity: 0.8 }}>
                  {item.qty} x {money(item.unitPrice)}
                </div>
              </td>
              <td style={{ textAlign: "right" }}>{money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr style={{ borderStyle: "dashed", borderWidth: 1, margin: "6px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Subtotal</span>
        <span>{money(vm.subtotal)}</span>
      </div>
      {vm.discount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Discount</span>
          <span>-{money(vm.discount)}</span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 700,
          fontSize: cfg.font + 1,
          borderTop: "1px solid #000",
          marginTop: 2,
          paddingTop: 2,
        }}
      >
        <span>Total</span>
        <span>{money(vm.total)}</span>
      </div>

      <hr style={{ borderStyle: "dashed", borderWidth: 1, margin: "6px 0" }} />

      {byMethod("cash") > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Cash</span>
          <span>{money(byMethod("cash"))}</span>
        </div>
      )}
      {byMethod("pos") > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>POS</span>
          <span>{money(byMethod("pos"))}</span>
        </div>
      )}
      {byMethod("transfer") > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Transfer</span>
          <span>{money(byMethod("transfer"))}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Paid</span>
        <span>{money(vm.amountPaid)}</span>
      </div>
      {vm.change > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Change</span>
          <span>{money(vm.change)}</span>
        </div>
      )}

      <hr style={{ borderStyle: "dashed", borderWidth: 1, margin: "6px 0" }} />

      {vm.isProvisional ? (
        <div
          style={{
            textAlign: "center",
            fontWeight: 700,
            border: "1px dashed #000",
            padding: "2px 0",
          }}
        >
          PENDING SYNC
        </div>
      ) : (
        <div style={{ textAlign: "center", fontWeight: 700 }}>
          {vm.statusLabel.toUpperCase()}
        </div>
      )}
      <div style={{ textAlign: "center", marginTop: 6 }}>
        Thank you for your patronage
      </div>
    </div>
  );
}

interface ReceiptDialogProps {
  order: ReceiptOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptDialog({ order, open, onOpenChange }: ReceiptDialogProps) {
  const [format, setFormat] = useState<ReceiptFormat>("80mm");
  const cfg = FORMAT_CONFIG[format];
  const vm = order ? toVM(order) : null;

  const handlePrint = () => {
    const styleId = "receipt-print-style";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #receipt-print, #receipt-print * { visibility: visible !important; }
        #receipt-print {
          position: absolute; left: 0; top: 0; width: ${cfg.width};
          box-shadow: none !important;
        }
        @page { size: ${cfg.page}; margin: 0; }
      }
    `;
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Receipt · {vm?.number}
            {vm?.isProvisional && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                Pending sync
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Preview the receipt, choose a paper width, then print.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 no-print">
          <span className="text-sm text-muted-foreground">Paper</span>
          <Select value={format} onValueChange={(v) => setFormat(v as ReceiptFormat)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="58mm">58mm thermal</SelectItem>
              <SelectItem value="80mm">80mm thermal</SelectItem>
              <SelectItem value="a4">A4</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-center overflow-auto rounded-md bg-muted/40 p-4">
          {vm && <ReceiptBody vm={vm} format={format} />}
        </div>

        <DialogFooter className="no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="size-4" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}