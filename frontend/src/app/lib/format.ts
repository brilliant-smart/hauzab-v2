const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 2,
});

export function formatCurrency(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return naira.format(num);
}

export function formatNumber(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("en-NG").format(num);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}