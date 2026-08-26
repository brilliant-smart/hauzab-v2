import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Product } from "@/app/api/types";
import { useStockReceived } from "@/app/api/stock";
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
  quantity: z.coerce.number().gt(0, "Enter a quantity greater than zero"),
  reason: z.string().optional(),
  note: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function StockReceivedForm() {
  const [product, setProduct] = useState<Product | null>(null);
  const mutation = useStockReceived();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 0 },
  });

  const onSubmit = (values: FormValues) => {
    if (!product) {
      toast.error("Select a product first");
      return;
    }
    mutation.mutate(
      { product, quantity: values.quantity, reason: values.reason, note: values.note },
      {
        onSuccess: () => {
          toast.success(`Received ${values.quantity} into ${product.name}`);
          setProduct(null);
          form.reset({ quantity: 0 });
        },
        onError: (e) => handleApiError(e),
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Stock Received" />

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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity Received <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input type="number" step="any" min={0} {...field} placeholder="Enter quantity" />
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
                    <Input {...field} placeholder="e.g. purchase, opening stock" />
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
                    <Input {...field} placeholder="Reference / batch" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex items-center justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              <Save className="size-4" />
              {mutation.isPending ? "Saving…" : "Record Stock Received"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}