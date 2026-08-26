import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Product } from "@/app/api/types";
import { useStockCount } from "@/app/api/stock";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ProductPicker } from "./ProductPicker";

const schema = z.object({
  counted: z.coerce.number().min(0, "Count cannot be negative"),
  reason: z.string().optional(),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function StockCountForm() {
  const [product, setProduct] = useState<Product | null>(null);
  const mutation = useStockCount();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { counted: 0 },
  });
  const counted = form.watch("counted");

  const onSubmit = (values: FormValues) => {
    if (!product) {
      toast.error("Select a product first");
      return;
    }
    mutation.mutate(
      { product, counted: values.counted, reason: values.reason, note: values.note },
      {
        onSuccess: () => {
          toast.success(`Counted ${values.counted} for ${product.name}`);
          setProduct(null);
          form.reset({ counted: 0 });
        },
        onError: (e) => handleApiError(e),
      },
    );
  };

  // Live adjustment hint: counted − current stock.
  const current = product ? Number(product.quantity) : 0;
  const adjustment = Number(counted || 0) - current;

  return (
    <div className="space-y-4">
      <PageHeader title="Stock Count" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Product <span className="text-destructive">*</span></label>
            <ProductPicker
              selected={product}
              onSelect={setProduct}
              onClear={() => setProduct(null)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="counted"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Counted Quantity <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="number" step="any" min={0} {...field} placeholder="Enter counted quantity" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. recount, correction" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Details" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {product && (
            <p className="text-sm text-muted-foreground">
              System stock: <span className="font-medium text-foreground">{current}</span>
              {" · Adjustment: "}
              <span className={adjustment < 0 ? "font-medium text-destructive" : adjustment > 0 ? "font-medium text-success" : "font-medium"}>
                {adjustment > 0 ? `+${adjustment}` : adjustment}
              </span>
            </p>
          )}

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              <Save className="size-4" />
              {mutation.isPending ? "Saving…" : "Record Stock Count"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}