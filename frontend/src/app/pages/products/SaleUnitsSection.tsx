import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useLookupList } from "@/app/api/catalog";
import { useAddSaleUnit, useDeleteSaleUnit, useSaleUnits } from "@/app/api/saleUnits";
import { handleApiError } from "@/app/lib/errorHandler";
import { formatCurrency } from "@/app/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Manage a product's non-base sale units (e.g. a Carton of 24). Stock stays in
 * the base unit; each sale unit adds a factor (base units per sale unit) and a
 * price so the POS can ring up cartons while the ledger decrements singles.
 *
 * Rendered only for an existing product that has a base unit set, and only for
 * catalog managers (admin, supervisor, Inventory Manager) — whoever converts a
 * product to base-unit stock also sets up its pack options.
 */
export function SaleUnitsSection({
  productId,
  baseUnitId,
  baseUnitName,
  costPrice,
}: {
  productId: number;
  baseUnitId: number | null;
  baseUnitName: string;
  costPrice: number;
}) {
  const units = useLookupList("product-units");
  const { data: saleUnits = [] } = useSaleUnits(productId);
  const addMutation = useAddSaleUnit(productId);
  const deleteMutation = useDeleteSaleUnit(productId);

  const [unitId, setUnitId] = useState("");
  const [factor, setFactor] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  // Units the product can be sold in beyond its base unit. The base unit itself
  // is implicit at factor 1 and never a row here.
  const availableUnits = (units.data ?? []).filter(
    (u) => u.id !== baseUnitId && !saleUnits.some((su) => su.unit_id === u.id),
  );

  const minPrice = costPrice * (factor || 0);
  const canAdd =
    !!unitId && factor > 0 && price > 0 && price >= minPrice - 1e-9;

  const handleAdd = () => {
    if (!canAdd) return;
    addMutation.mutate(
      { unit_id: Number(unitId), factor, selling_price: price },
      {
        onSuccess: () => {
          toast.success("Sale unit added");
          setUnitId("");
          setFactor(0);
          setPrice(0);
        },
        onError: (e) => handleApiError(e),
      },
    );
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Sale Units</h2>
        <p className="text-xs text-muted-foreground">
          Stock is held in {baseUnitName}. Add larger sale units (e.g. a carton) the
          POS can ring up — each carries a factor and a price. A sale unit price can
          never fall below cost for its factor.
        </p>
      </div>

      {saleUnits.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {saleUnits.map((su) => (
            <li
              key={su.id}
              className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{su.unit?.name ?? "Unit"}</span>{" "}
                <span className="text-muted-foreground">×{su.factor}</span>
                {" — "}
                {formatCurrency(su.selling_price)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive"
                aria-label={`Remove ${su.unit?.name ?? "sale unit"}`}
                disabled={deleteMutation.isPending}
                onClick={() =>
                  deleteMutation.mutate(su.id, {
                    onSuccess: () => toast.success("Sale unit removed"),
                    onError: (e) => handleApiError(e),
                  })
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {availableUnits.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {saleUnits.length > 0
            ? "Every configured unit already has a sale unit."
            : "Add a unit on the Units page to create a sale unit."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                {availableUnits.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Factor (per {baseUnitName})</Label>
            <Input
              type="number"
              min={1}
              step="any"
              value={factor || ""}
              onChange={(e) => setFactor(Number(e.target.value) || 0)}
              placeholder="24"
              className="h-9 w-28"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              Price {factor > 0 && <span className="text-muted-foreground">(≥ {formatCurrency(minPrice)})</span>}
            </Label>
            <Input
              type="number"
              min={minPrice || 0}
              step="any"
              value={price || ""}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              placeholder="0.00"
              className="h-9 w-32"
            />
          </div>
          <Button type="button" disabled={!canAdd || addMutation.isPending} onClick={handleAdd}>
            {addMutation.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}