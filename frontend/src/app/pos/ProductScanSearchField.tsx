import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Product } from "@/app/api/types";
import { formatCurrency } from "@/app/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProductScanSearch } from "@/app/pos/useProductScanSearch";

interface ProductScanSearchFieldProps {
  scan: ProductScanSearch;
}

function stockState(p: Product): { label: string; tone: string } {
  const qty = Number(p.quantity) || 0;
  if (qty <= 0) return { label: "Out of stock", tone: "text-destructive" };
  const reorder = Number(p.reorder_level) || 0;
  if (reorder > 0 && qty <= reorder) return { label: `Low: ${qty}`, tone: "text-warning" };
  return { label: `In stock: ${qty}`, tone: "text-success" };
}

/**
 * Unified scan + search field. A single always-focused input drives a debounced
 * name-search dropdown; pressing Enter on a barcode (or a lone match) adds the
 * product directly. Out-of-stock rows are disabled and won't scan through.
 */
export function ProductScanSearchField({ scan }: ProductScanSearchFieldProps) {
  const { inputRef, query, results, isSearching, onChange, onSubmit, select, clear } = scan;
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const value = query.trim();
  const pendingBarcode = /^\d+$/.test(value) && value.length > 6;
  const open = value.length > 0 && !pendingBarcode && (results.length > 0 || isSearching);

  // Reset the keyboard highlight whenever the result set or query changes.
  useEffect(() => {
    setActive(-1);
  }, [results, query]);

  // Click-outside and Esc close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) clear();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, clear]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length) setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length) setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length > 0 && active >= 0) select(results[active]);
      else onSubmit();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Scan barcode or search product…"
        autoFocus
        className="h-12 pl-10 pr-9 text-base"
      />
      {query && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-lg border bg-card shadow-lg">
          {isSearching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          ) : (
            results.map((p, i) => {
              const out = Number(p.quantity) <= 0;
              const stock = stockState(p);
              const subline = [p.size, p.barcode].filter(Boolean).join(" · ");
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={out}
                  onClick={() => select(p)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0",
                    out
                      ? "cursor-not-allowed opacity-60"
                      : "hover:bg-accent",
                    active === i && !out && "bg-accent",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-medium", out && "text-muted-foreground line-through")}>
                      {p.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      {subline && <span className="truncate text-xs text-muted-foreground">{subline}</span>}
                      <span className={cn("text-xs font-medium", stock.tone)}>{stock.label}</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(p.selling_price)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}