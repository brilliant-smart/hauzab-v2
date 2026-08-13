import { LookupConfig, default as LookupManager } from "./LookupManager";
import { Column } from "@/components/DataTable";
import { NamedResource } from "@/app/api/types";

const columns: Column<NamedResource>[] = [
  { key: "name", header: "Category", cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
  { key: "products_count", header: "Products", cell: (r) => r.products_count ?? 0 },
];

const config: LookupConfig = {
  resource: "product-categories",
  title: "Product Categories",
  description: "Group your stock into categories",
  itemNoun: "Category",
  fields: [
    { name: "name", label: "Name", required: true, placeholder: "Category name" },
    { name: "description", label: "Description", type: "textarea", placeholder: "Optional notes" },
  ],
  columns,
};

export default function Categories() {
  return <LookupManager config={config} />;
}