import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import {
  useLookupList,
  useProduct,
  useSaveProduct,
} from "@/app/api/catalog";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NamedResource, ContactResource } from "@/app/api/types";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  size: z.string().optional(),
  model: z.string().optional(),
  department: z.string().optional(),
  category_id: z.string().optional(),
  unit_id: z.string().optional(),
  manufacturer_id: z.string().optional(),
  supplier_id: z.string().optional(),
  quantity: z.coerce.number().min(0, "Required"),
  cost_price: z.coerce.number().min(0, "Required"),
  selling_price: z.coerce.number().min(0, "Required"),
  reorder_level: z.coerce.number().min(0).optional(),
  barcode: z.string().optional(),
  manufacture_date: z.string().optional(),
  expire_date: z.string().optional(),
  is_active: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.selling_price < data.cost_price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["selling_price"],
      message: "Selling price cannot be below cost price",
    });
  }
  if (data.manufacture_date && data.expire_date && data.expire_date <= data.manufacture_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expire_date"],
      message: "Expire date must be after the manufacture date",
    });
  }
});

type FormValues = z.infer<typeof schema>;

function toSelectOptions(list: (NamedResource & Partial<ContactResource>)[] | undefined) {
  return (list ?? []).map((item) => ({ value: String(item.id), label: item.name }));
}

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: product } = useProduct(id ? Number(id) : undefined);
  const categories = useLookupList("product-categories");
  const units = useLookupList("product-units");
  const manufacturers = useLookupList("product-manufacturers");
  const suppliers = useLookupList("product-suppliers");
  const saveMutation = useSaveProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: 0,
      cost_price: 0,
      selling_price: 0,
      reorder_level: 1,
      is_active: true,
    },
  });

  useEffect(() => {
    if (isEdit && product) {
      form.reset({
        name: product.name,
        description: product.description ?? "",
        size: product.size ?? "",
        model: product.model ?? "",
        department: product.department ?? "",
        category_id: product.category_id ? String(product.category_id) : "",
        unit_id: product.unit_id ? String(product.unit_id) : "",
        manufacturer_id: product.manufacturer_id ? String(product.manufacturer_id) : "",
        supplier_id: product.supplier_id ? String(product.supplier_id) : "",
        quantity: Number(product.quantity),
        cost_price: Number(product.cost_price),
        selling_price: Number(product.selling_price),
        reorder_level: product.reorder_level,
        barcode: product.barcode ?? "",
        manufacture_date: product.manufacture_date ?? "",
        expire_date: product.expire_date ?? "",
        is_active: product.is_active,
      });
    }
  }, [isEdit, product, form]);

  const onSubmit = (values: FormValues) => {
    const payload: Record<string, unknown> = {
      ...values,
      category_id: values.category_id || null,
      unit_id: values.unit_id || null,
      manufacturer_id: values.manufacturer_id || null,
      supplier_id: values.supplier_id || null,
      manufacture_date: values.manufacture_date || null,
      expire_date: values.expire_date || null,
      barcode: values.barcode || null,
    };

    saveMutation.mutate(
      { id: id ? Number(id) : undefined, payload },
      {
        onSuccess: () => {
          toast.success(isEdit ? "Product updated" : "Product added");
          navigate("/products");
        },
        onError: (e) => handleApiError(e),
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEdit ? "Edit Product" : "Add New Product"}
        actions={
          <Button variant="outline" asChild>
            <Link to="/products">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barcode / Code</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Scan or enter barcode" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-4">
            <FormField
              control={form.control}
              name="size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Size</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reorder_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Level</FormLabel>
                  <FormControl><Input type="number" min={0} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {toSelectOptions(categories.data).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {toSelectOptions(units.data).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="manufacturer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Manufacturer</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select manufacturer" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {toSelectOptions(manufacturers.data).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="supplier_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {toSelectOptions(suppliers.data).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity *</FormLabel>
                  <FormControl><Input type="number" step="any" min={0} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cost_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost Price *</FormLabel>
                  <FormControl><Input type="number" step="any" min={0} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="selling_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selling Price *</FormLabel>
                  <FormControl><Input type="number" step="any" min={0} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="manufacture_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Manufacture Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expire_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expire Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="is_active"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3 rounded-md border p-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div>
                  <FormLabel>Active</FormLabel>
                  <p className="text-xs text-muted-foreground">Inactive products are hidden from the till.</p>
                </div>
              </FormItem>
            )}
          />

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/products">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving…" : isEdit ? "Update Product" : "Save Product"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}