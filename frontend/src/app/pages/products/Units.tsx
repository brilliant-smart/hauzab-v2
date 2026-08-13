import { LookupConfig, default as LookupManager } from "./LookupManager";
import { Column } from "@/components/DataTable";
import { NamedResource } from "@/app/api/types";

const columns: Column<NamedResource>[] = [
  { key: "name", header: "Unit", cell: (r) => <span className="font-medium">{r.name}</span> },
  { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
  { key: "products_count", header: "Products", cell: (r) => r.products_count ?? 0 },
];

const config: LookupConfig = {
  resource: "product-units",
  title: "Product Units",
  description: "Units of measure for your stock (carton, piece, strip…)",
  itemNoun: "Unit",
  fields: [
    { name: "name", label: "Name", required: true, placeholder: "e.g. Carton" },
    { name: "description", label: "Description", type: "textarea", placeholder: "Optional notes" },
  ],
  columns,
};

export default function Units() {
  return <LookupManager config={config} />;
}