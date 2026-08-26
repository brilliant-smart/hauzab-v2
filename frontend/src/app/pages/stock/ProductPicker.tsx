import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Product } from "@/app/api/types";
import { useProducts } from "@/app/api/catalog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ProductPickerProps {
  selected: Product | null;
  onSelect: (product: Product) => void;
  onClear: () => void;
}

/**
 * Debounced name/barcode search with a dropdown of results. Used by the
 * Stock Received, Write-off, and Stock Count forms to pick the product the
 * action applies to. After a pick the selected product is shown as a summary
 * card with a "Change" button to search again.
 */
export function ProductPicker({ selected, onSelect, onClear }: ProductPickerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useProducts({
    search: debounced || undefined,
    per_page: 10,
  });
  const results = data?.data ?? [];

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{selected.name}</p>
          <p className="text-xs text-muted-foreground">
            {[selected.size, selected.barcode].filter(Boolean).join(" · ") || "—"}
            {" · In stock: "}{Number(selected.quantity)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  const showDropdown = open && debounced.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search product by name or barcode…"
        className="pl-9 pr-9"
      />
      {query && (
        <button
          type="button"
          onClick={() => { setQuery(""); setDebounced(""); }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-card shadow-lg">
          {isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">No products found.</div>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p); setQuery(""); setDebounced(""); setOpen(false); }}
                className="flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.size, p.barcode].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className={cn("shrink-0 text-xs font-medium", Number(p.quantity) <= 0 ? "text-destructive" : "text-muted-foreground")}>
                  {Number(p.quantity)} in stock
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}