import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Save } from "lucide-react";
import {
  useLookupList,
  useProduct,
  useSaveProduct,
  useUploadProductImage,
} from "@/app/api/catalog";
import { NamedResource, ContactResource } from "@/app/api/types";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
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

// Mirrors the legacy add-product form: the fields, labels, order, and
// required markers match the blade screen staff are trained on.
const schema = z.object({
  barcode: z.string().optional(),
  name: z.string().min(1, "Product name is required"),
  size: z.string().min(1, "Product size is required"),
  quantity: z.coerce.number().min(0, "Required"),
  cost_price: z.coerce.number().min(0, "Required"),
  selling_price: z.coerce.number().min(0, "Required"),
  department: z.string().min(1, "Department is required"),
  manufacture_date: z.string().optional(),
  expire_date: z.string().optional(),
  reorder_level: z.coerce.number().min(0).optional(),
  manufacturer_id: z.string().optional(),
  supplier_id: z.string().optional(),
  model: z.string().optional(),
  image: z.string().optional(),
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
  const manufacturers = useLookupList("product-manufacturers");
  const suppliers = useLookupList("product-suppliers");
  const saveMutation = useSaveProduct();
  const uploadImage = useUploadProductImage();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: 0,
      cost_price: 0,
      selling_price: 0,
    },
  });

  useEffect(() => {
    if (isEdit && product) {
      form.reset({
        barcode: product.barcode ?? "",
        name: product.name,
        size: product.size ?? "",
        quantity: Number(product.quantity),
        cost_price: Number(product.cost_price),
        selling_price: Number(product.selling_price),
        department: product.department ?? "",
        manufacture_date: product.manufacture_date ?? "",
        expire_date: product.expire_date ?? "",
        reorder_level: product.reorder_level,
        manufacturer_id: product.manufacturer_id ? String(product.manufacturer_id) : "",
        supplier_id: product.supplier_id ? String(product.supplier_id) : "",
        model: product.model ?? "",
        image: product.image ?? "",
      });
      setImagePreview(product.image_url ?? null);
    }
  }, [isEdit, product, form]);

  const handleImage = (file: File | undefined) => {
    if (!file) return;
    uploadImage.mutate(file, {
      onSuccess: (res) => {
        form.setValue("image", res.path);
        setImagePreview(res.url);
        toast.success("Image attached");
      },
      onError: (e) => handleApiError(e),
    });
  };

  const onSubmit = (values: FormValues) => {
    const { reorder_level, ...rest } = values;
    const payload: Record<string, unknown> = {
      ...rest,
      manufacturer_id: values.manufacturer_id || null,
      supplier_id: values.supplier_id || null,
      manufacture_date: values.manufacture_date || null,
      expire_date: values.expire_date || null,
      barcode: values.barcode || null,
      model: values.model || null,
      image: values.image || null,
    };
    // Send reorder_level only when the field was filled; a blank Order level
    // lets the backend apply its NOT NULL column default on create (and keeps
    // the existing value on edit).
    if (reorder_level != null) {
      payload.reorder_level = reorder_level;
    }

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
      <PageHeader title={isEdit ? "Edit Product" : "Add Products"} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* QR/Bar Code (5) + Product Name (7) — legacy row 1 */}
          <div className="grid gap-4 md:grid-cols-12">
            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem className="md:col-span-5">
                  <FormLabel>
                    QR/Bar Code <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} autoFocus placeholder="Scan QR/Bar code" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-7">
                  <FormLabel>
                    Product Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter Product name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Remaining fields flow three-per-row, matching legacy col-md-4 */}
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Product Size <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter Product Size" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Product Quantity <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="any" min={0} {...field} placeholder="Enter Quantity" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cost_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Unit Cost Price <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="any" min={0} {...field} placeholder="Enter cost_price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="selling_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Unit Selling Price <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input type="number" step="any" min={0} {...field} placeholder="Enter selling price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Product Department <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter Department" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="manufacture_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Manufacture Date</FormLabel>
                  <FormControl>
                    <DatePicker value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
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
                  <FormControl>
                    <DatePicker value={field.value ?? ""} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reorder_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order level</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} {...field} placeholder="Enter Order Level" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="manufacturer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Manufacturer</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select manufacturer" />
                      </SelectTrigger>
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
                  <FormLabel>Product Supplier</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
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
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Batch Number</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Product Image — file input + preview, like the legacy form */}
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Image</FormLabel>
                  <FormControl>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground hover:file:bg-primary/90"
                      onChange={(e) => {
                        handleImage(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      disabled={uploadImage.isPending}
                    />
                  </FormControl>
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Product preview"
                      className="mt-2 h-24 w-24 rounded-md border object-cover"
                    />
                  )}
                  <input type="hidden" {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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