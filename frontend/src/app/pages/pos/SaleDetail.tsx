import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Printer } from "lucide-react";
import { useOrder, useVoidOrder } from "@/app/api/orders";
import { useAuth } from "@/app/auth/AuthContext";
import { isAtLeast } from "@/app/auth/guards";
import { formatCurrency, formatDate } from "@/app/lib/format";
import { ReceiptDialog } from "@/app/pos/ReceiptDialog";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SaleDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ? Number(id) : undefined;
  const { user } = useAuth();
  const canManage = isAtLeast(user, "supervisor");

  const { data: order, isLoading } = useOrder(orderId);
  const voidOrder = useVoidOrder();
  const [receiptOpen, setReceiptOpen] = useState(false);

  const handleVoid = () => {
    if (!orderId) return;
    voidOrder.mutate(orderId, {
      onSuccess: () => toast.success("Sale voided and stock restored"),
    });
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Loading sale…</p>;
  }

  if (!order) {
    return <p className="text-muted-foreground">Sale not found.</p>;
  }

  const canVoid = canManage && order.status.value === "completed";

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Sale ${order.number}`}
        description={`${formatDate(order.created_at)} · ${order.status.label}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/pos/history"><ArrowLeft className="size-4" /> Back</Link>
            </Button>
            <Button variant="secondary" onClick={() => setReceiptOpen(true)}>
              <Printer className="size-4" /> Reprint
            </Button>
            {canVoid && (
              <ConfirmDelete
                trigger={<Button variant="destructive">Void Sale</Button>}
                itemName={`sale ${order.number}`}
                message="This reverses the sale and restores stock. The record is kept as voided."
                onConfirm={handleVoid}
                loading={voidOrder.isPending}
              />
            )}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Order #" value={order.number} />
            <Row label="Date" value={formatDate(order.created_at)} />
            <Row label="Cashier" value={order.user?.name ?? "—"} />
            <Row label="Customer" value={order.customer_name ?? "Walk-in"} />
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">Status</span>
              {order.status.value === "completed" ? (
                <Badge variant="success">Completed</Badge>
              ) : order.status.value === "voided" ? (
                <Badge variant="destructive">Voided</Badge>
              ) : (
                <Badge variant="outline">Pending</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell className="text-right">{Number(item.quantity)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
              {Number(order.discount) > 0 && (
                <Row label="Discount" value={`-${formatCurrency(order.discount)}`} />
              )}
              <div className="flex justify-between text-base font-semibold border-t pt-1.5">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 text-sm">
              <p className="text-muted-foreground">Tender</p>
              {order.payments.map((p) => (
                <Row key={p.id} label={p.method.label} value={formatCurrency(p.amount)} />
              ))}
              <Row label="Paid" value={formatCurrency(order.amount_paid)} />
              {Number(order.change) > 0 && (
                <Row label="Change" value={formatCurrency(order.change)} />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ReceiptDialog order={order} open={receiptOpen} onOpenChange={setReceiptOpen} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}