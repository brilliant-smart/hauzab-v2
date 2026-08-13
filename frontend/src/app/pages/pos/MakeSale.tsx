import { useRef, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import { useProducts } from "@/app/api/catalog";
import { useCustomers } from "@/app/api/customers";
import { useCreateOrder } from "@/app/api/orders";
import { Product } from "@/app/api/types";
import { api } from "@/app/lib/api";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency } from "@/app/lib/format";
import { useCart } from "@/app/pos/useCart";
import { ReceiptDialog } from "@/app/pos/ReceiptDialog";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Order, PaymentMethodValue } from "@/app/api/types";

const TENDER_METHODS: { value: PaymentMethodValue; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
  { value: "transfer", label: "Transfer" },
];

function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function MakeSale() {
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const cart = useCart();
  const createOrder = useCreateOrder();
  const { data: productsData, isLoading } = useProducts({ search, per_page: 25 });
  const { data: customersData } = useCustomers({ per_page: 50 });

  const products = productsData?.data ?? [];

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    try {
      const { data } = await api.get<{ data: Product[] }>("products", {
        params: { search: code, per_page: 5 },
      });
      const exact = data.data.find((p) => p.barcode === code);
      const match = exact ?? data.data[0];
      if (match) {
        cart.add(match);
        toast.success(`Added ${match.name}`);
      } else {
        toast.error("No product matches that code");
      }
    } catch (err) {
      handleApiError(err);
    } finally {
      setScan("");
    }
  };

  const total = Math.max(0, cart.subtotal - discount);

  const completeSale = (tender: Record<PaymentMethodValue, number>) => {
    const payments = TENDER_METHODS.map((m) => ({
      method: m.value,
      amount: Math.max(0, tender[m.value] || 0),
    })).filter((p) => p.amount > 0);

    if (payments.length === 0) {
      toast.error("Enter a tender amount");
      return;
    }

    const payload = {
      uuid: newUuid(),
      items: cart.items.map((l) => ({
        product_id: l.productId,
        quantity: l.qty,
        unit_price: l.price,
      })),
      discount,
      payments,
      customer_id: customerId ? Number(customerId) : null,
    };

    createOrder.mutate(payload, {
      onSuccess: (order) => {
        toast.success(`Sale completed · ${order.number}`);
        cart.clear();
        setDiscount(0);
        setCustomerId("");
        setPaymentOpen(false);
        setReceiptOrder(order);
        setReceiptOpen(true);
      },
      onError: (err) => handleApiError(err),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Make Sale" description="Scan or pick items, then tender payment" />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Product picker */}
        <div className="space-y-3">
          <form onSubmit={handleScan} className="flex gap-2">
            <Input
              placeholder="Scan barcode and press Enter…"
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              className="max-w-xs"
              autoFocus
            />
            <Button type="submit" variant="secondary">Add</Button>
          </form>

          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && products.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No products</td></tr>
                )}
                {products.map((p) => {
                  const out = Number(p.quantity) <= 0;
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[p.size, p.barcode].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{p.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(p.selling_price)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={out}
                          onClick={() => cart.add(p)}
                        >
                          <Plus className="size-4" /> Add
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cart */}
        <div className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Cart ({cart.count})</h2>
            {cart.items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={cart.clear}>
                Clear
              </Button>
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue placeholder="Walk-in customer" />
              </SelectTrigger>
              <SelectContent>
                {customersData?.data.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="max-h-[40vh] space-y-2 overflow-y-auto">
            {cart.items.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Cart is empty. Scan or add a product.
              </p>
            )}
            {cart.items.map((line) => (
              <div key={line.productId} className="space-y-1 rounded-md border p-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">{line.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => cart.remove(line.productId)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => cart.setQty(line.productId, line.qty - 1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={line.stock}
                      value={line.qty}
                      onChange={(e) =>
                        cart.setQty(line.productId, Number(e.target.value) || 0)
                      }
                      className="h-7 w-12 rounded-none border-x text-center"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      onClick={() => cart.setQty(line.productId, line.qty + 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min={line.costPrice}
                    step="0.01"
                    value={line.price}
                    onChange={(e) =>
                      cart.setPrice(line.productId, Math.max(line.costPrice, Number(e.target.value) || 0))
                    }
                    className="h-7 w-24"
                  />
                  <span className="ml-auto text-sm font-medium">
                    {formatCurrency(line.qty * line.price)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(cart.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Discount</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={discount || ""}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-28 text-right"
                placeholder="0.00"
              />
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={cart.items.length === 0}
            onClick={() => setPaymentOpen(true)}
          >
            Charge {formatCurrency(total)}
          </Button>
        </div>
      </div>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        total={total}
        loading={createOrder.isPending}
        onComplete={completeSale}
      />

      <ReceiptDialog
        order={receiptOrder}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
    </div>
  );
}

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  loading: boolean;
  onComplete: (tender: Record<PaymentMethodValue, number>) => void;
}

function PaymentDialog({ open, onOpenChange, total, loading, onComplete }: PaymentDialogProps) {
  const [tender, setTender] = useState<Record<PaymentMethodValue, number>>({
    cash: 0,
    pos: 0,
    transfer: 0,
  });

  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const reset = () => setTender({ cash: 0, pos: 0, transfer: 0 });

  const tendered = tender.cash + tender.pos + tender.transfer;
  const change = Math.max(0, tendered - total);
  const canComplete = tendered >= total && total > 0;

  const setAmount = (method: PaymentMethodValue, value: number) =>
    setTender((prev) => ({ ...prev, [method]: Math.max(0, value) }));

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tender Payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount due</span>
            <span className="text-lg font-semibold">{formatCurrency(total)}</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {TENDER_METHODS.map((m) => (
              <div key={m.value} className="flex items-center gap-2">
                <Label className="w-20 text-sm">{m.label}</Label>
                <Input
                  ref={(el) => { inputsRef.current[m.value] = el; }}
                  type="number"
                  min={0}
                  step="0.01"
                  value={tender[m.value] || ""}
                  onChange={(e) => setAmount(m.value, Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="text-right"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(m.value, total - (tendered - tender[m.value]))}
                >
                  Exact
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tendered</span>
            <span>{formatCurrency(tendered)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium">
            <span>Change</span>
            <span>{formatCurrency(change)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button disabled={!canComplete || loading} onClick={() => onComplete(tender)}>
            {loading ? "Saving…" : "Complete Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}