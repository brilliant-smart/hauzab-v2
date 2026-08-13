import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { useEmployee, useSaveEmployee } from "@/app/api/employees";
import { ROLE_OPTIONS } from "@/app/api/types";
import { useAuth } from "@/app/auth/AuthContext";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().optional(),
  role: z.enum(["admin", "supervisor", "staff"]),
  is_active: z.boolean(),
  fullname: z.string().optional(),
  gender: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  qualification: z.string().optional(),
  designation: z.string().optional(),
  state: z.string().optional(),
  account_name: z.string().optional(),
  account_number: z.string().optional(),
  bank_name: z.string().optional(),
  salary: z.coerce.number().min(0).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: employee } = useEmployee(id ? Number(id) : undefined);
  const saveMutation = useSaveEmployee();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: "staff",
      is_active: true,
      salary: 0,
    },
  });

  useEffect(() => {
    if (isEdit && employee) {
      form.reset({
        name: employee.name,
        email: employee.email,
        password: "",
        role: employee.role,
        is_active: employee.is_active,
        fullname: employee.profile?.fullname ?? "",
        gender: employee.profile?.gender ?? "",
        phone: employee.profile?.phone ?? "",
        address: employee.profile?.address ?? "",
        qualification: employee.profile?.qualification ?? "",
        designation: employee.profile?.designation ?? "",
        state: employee.profile?.state ?? "",
        account_name: employee.profile?.account_name ?? "",
        account_number: employee.profile?.account_number ?? "",
        bank_name: employee.profile?.bank_name ?? "",
        salary: employee.profile?.salary ? Number(employee.profile.salary) : 0,
      });
    }
  }, [isEdit, employee, form]);

  const onSubmit = (values: FormValues) => {
    const payload: Record<string, unknown> = { ...values };
    if (isEdit && !values.password) delete payload.password;
    if (!values.salary) payload.salary = 0;

    saveMutation.mutate(
      { id: id ? Number(id) : undefined, payload },
      {
        onSuccess: () => {
          toast.success(isEdit ? "Employee updated" : "Employee added");
          navigate("/employees");
        },
        onError: (e) => handleApiError(e),
      },
    );
  };

  const roleOptions = isAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value === "staff");

  return (
    <div className="space-y-4">
      <PageHeader
        title={isEdit ? "Edit Employee" : "Add Employee"}
        actions={
          <Button variant="outline" asChild>
            <Link to="/employees">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password {isEdit ? "(leave blank to keep)" : "*"}</FormLabel>
                    <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roleOptions.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <FormLabel>Can log in</FormLabel>
                    <p className="text-xs text-muted-foreground">Disable to revoke access without deleting the record.</p>
                  </div>
                </FormItem>
              )}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Profile</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="fullname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="designation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Designation</FormLabel>
                    <FormControl><Input placeholder="e.g. Cashier" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="qualification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualification</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Payroll / Bank</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <FormField
                control={form.control}
                name="salary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary (₦)</FormLabel>
                    <FormControl><Input type="number" min={0} step="any" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="account_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="account_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/employees">Cancel</Link>
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              <Save className="size-4" />
              {saveMutation.isPending ? "Saving…" : isEdit ? "Update Employee" : "Save Employee"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}