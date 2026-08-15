import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { useDeleteEmployee, useEmployees } from "@/app/api/employees";
import { Employee } from "@/app/api/types";
import { handleApiError } from "@/app/lib/errorHandler";
import { PageHeader } from "@/components/PageHeader";
import { DataTable, Column } from "@/components/DataTable";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<Employee["role"], string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  staff: "Staff",
};

export default function EmployeeList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, isError, refetch } = useEmployees({ search, page });
  const deleteMutation = useDeleteEmployee();

  const handleDelete = (emp: Employee) => {
    deleteMutation.mutate(emp.id, {
      onSuccess: () => toast.success("Employee deleted"),
      onError: (e) => handleApiError(e),
    });
  };

  const columns: Column<Employee>[] = [
    {
      key: "name",
      header: "Name",
      cell: (e) => (
        <div>
          <div className="font-medium">{e.name}</div>
          <div className="text-xs text-muted-foreground">{e.profile?.designation ?? "—"}</div>
        </div>
      ),
    },
    { key: "email", header: "Email", cell: (e) => e.email },
    { key: "phone", header: "Phone", cell: (e) => e.profile?.phone ?? "—" },
    {
      key: "role",
      header: "Role",
      cell: (e) => <Badge variant="secondary">{ROLE_LABEL[e.role]}</Badge>,
    },
    { key: "branch", header: "Branch", cell: (e) => e.branch?.name ?? "—" },
    {
      key: "status",
      header: "Status",
      cell: (e) =>
        e.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Disabled</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (e) => (
        <div className="flex items-center justify-end gap-1">
          <Button asChild variant="ghost" size="icon">
            <Link to={`/employees/${e.id}/edit`}>
              <Pencil className="size-4" />
            </Link>
          </Button>
          <ConfirmDelete
            itemName={e.name}
            message="This will remove the employee's login and profile."
            onConfirm={() => handleDelete(e)}
            loading={deleteMutation.isPending}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Employee Record"
        description="Staff accounts for this tenant"
        actions={
          <Button asChild>
            <Link to="/employees/new">
              <Plus className="size-4" /> Add Employee
            </Link>
          </Button>
        }
      />

      <Input
        placeholder="Search by name or email…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-sm"
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading || isFetching}
        error={isError}
        onRetry={() => refetch()}
        rowKey={(e) => e.id}
        page={data?.current_page}
        lastPage={data?.last_page}
        total={data?.total}
        from={data?.from}
        to={data?.to}
        onPageChange={setPage}
      />
    </div>
  );
}