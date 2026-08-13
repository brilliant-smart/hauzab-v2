import { LookupConfig, default as LookupManager } from "./LookupManager";
import { Column } from "@/components/DataTable";
import { ContactResource } from "@/app/api/types";

const columns: Column<ContactResource>[] = [
  { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "phone", header: "Phone", cell: (r) => r.phone ?? "—" },
  { key: "email", header: "Email", cell: (r) => r.email ?? "—" },
  { key: "address", header: "Address", cell: (r) => r.address ?? "—" },
  { key: "products_count", header: "Products", cell: (r) => r.products_count ?? 0 },
];

const config: LookupConfig = {
  resource: "product-suppliers",
  title: "Product Suppliers",
  description: "Manage the suppliers you buy stock from",
  itemNoun: "Supplier",
  fields: [
    { name: "name", label: "Name", required: true, placeholder: "Supplier name" },
    { name: "phone", label: "Phone", placeholder: "Contact phone" },
    { name: "email", label: "Email", type: "email", placeholder: "contact@example.com" },
    { name: "address", label: "Address", placeholder: "Street, city" },
  ],
  columns,
};

export default function Suppliers() {
  return <LookupManager config={config} />;
}