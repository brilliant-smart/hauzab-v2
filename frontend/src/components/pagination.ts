// Numbered page buttons to render, with "…" where a gap sits. Mirrors the
// simple_numbers style the legacy DataTables tables used. Shared by the flat
// DataTable and the grouped sales-history table so paging stays consistent.
export function pageList(current: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(last - 1, current + 1);
  if (left > 2) items.push("…");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < last - 1) items.push("…");
  items.push(last);
  return items;
}