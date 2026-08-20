import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { useConsignment, useSaveConsignment } from "@/app/api/consignments";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  model: z.string().optional(),
  size: z.string().optional(),
  department: z.string().optional(),
  category: z.string().optional(),
  quantity: z.coerce.number().min(0, "Required"),
  unit_cost: z.coerce.number().min(0, "Required"),
  unit_price: z.coerce.number().min(0, "Required"),
  image: z.string().optional(),
  consignment: z.string().optional(),
  manufacture_date: z.string().optional(),
  expire_date: z.string().optional(),
  date: z.string().optional(),
  barcode: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.unit_price < data.unit_cost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["unit_price"],
      message: "Unit price cannot be below unit cost",
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

export default function ConsignmentForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const { data: consignment } = useConsignment(id ? Number(id) : undefined);
  const saveMutation = useSaveConsignment();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 0, unit_cost: 0, unit_price: 0 },
  });

  useEffect(() => {
    if (isEdit && consignment) {
      form.reset({
        name: consignment.name,
        description: consignment.description ?? "",
        model: consignment.model ?? "",
        size: consignment.size ?? "",
        department: consignment.department ?? "",
        category: consignment.category ?? "",
        quantity: Number(consignment.quantity),
        unit_cost: Number(consignment.unit_cost),
        unit_price: Number(consignment.unit_price),
        image: consignment.image ?? "",
        consignment: consignment.consignment ?? "",
        manufacture_date: consignment.manufacture_date ?? "",
        expire_date: consignment.expire_date ?? "",
        date: consignment.date ?? "",
        barcode: consignment.barcode ?? "",
      });
    }
  }, [isEdit, consignment, form]);

  const onSubmit = (values: FormValues) => {
    const unitProfit = Number(values.unit_price) - Number(values.unit_cost);
    const payload: Record<string, unknown> = {
      ...values,
      unit_profit: unitProfit,
      description: values.description || null,
      model: values.model || null,
      size: values.size || null,
      department: values.department || null,
      category: values.category || null,
      image: values.image || null,
      consignment: values.consignment || null,
      manufacture_date: values.manufacture_date || null,
      expire_date: values.expire_date || null,
      date: values.date || null,
      barcode: values.barcode || null,
    };

    saveMutation.mutate(
      { id: id ? Number(id) : undefined, payload },
      {
        onSuccess: () => {
          toast.success(isEdit ? "Stock receipt updated" : "Stock receipt added");
          navigate("/consignments");
        },
        onError: (e) => handleApiError(e),
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEdit ? "Edit Stock Receipt" : "Add Stock Receipt"}
        actions={
          <Button variant="outline" asChild>
            <Link to="/consignments">
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
                  <FormControl><Input {...field} /></FormControl>
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
                  <FormControl><Input {...field} placeholder="Scan or enter barcode" /></FormControl>
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
                <FormControl><Textarea rows={2} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 md:grid-cols-4">
            <FormField control={form.control} name="model" render={({ field }) => (
              <FormItem><FormLabel>Model</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="size" render={({ field }) => (
              <FormItem><FormLabel>Size</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="department" render={({ field }) => (
              <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem><FormLabel>Category</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FormField control={form.control} name="quantity" render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity *</FormLabel>
                <FormControl><Input type="number" step="any" min={0} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="unit_cost" render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Cost *</FormLabel>
                <FormControl><Input type="number" step="any" min={0} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="unit_price" render={({ field }) => (
              <FormItem>
                <FormLabel>Unit Price *</FormLabel>
                <FormControl><Input type="number" step="any" min={0} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <FormField control={form.control} name="manufacture_date" render={({ field }) => (
              <FormItem><FormLabel>Manufacture Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="expire_date" render={({ field }) => (
              <FormItem><FormLabel>Expire Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="date" render={({ field }) => (
              <FormItem><FormLabel>Receipt Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>

          <FormField
            control={form.control}
            name="consignment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Note</FormLabel>
                <FormControl><Input {...field} placeholder="Reference" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/consignments">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving…" : isEdit ? "Update Stock Receipt" : "Save Stock Receipt"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}