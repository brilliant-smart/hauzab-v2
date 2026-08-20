import { useCallback, useRef, useState } from "react";
import { api } from "@/app/lib/api";
import { Product } from "@/app/api/types";

interface UseProductScanSearchOptions {
  /** How many name matches to fetch for the dropdown. */
  perPage?: number;
  /**
   * Called when a product is chosen — from a dropdown click, a single-result
   * Enter, or an exact barcode scan. The caller decides whether it lands in the
   * cart (and enforces the out-of-stock rule).
   */
  onSelect: (product: Product) => void;
  /** Called when a scanned code matches no product. */
  onNotFound?: (code: string) => void;
}

export interface ProductScanSearch {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  results: Product[];
  isSearching: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  select: (product: Product) => void;
  clear: () => void;
  focus: () => void;
}

/**
 * One input that does both: type a name to get a debounced dropdown of matches,
 * or scan/type a barcode and press Enter for an exact lookup. The two paths are
 * distinguished by the input value — pure-numeric input longer than 6 chars is
 * treated as a barcode in progress, so the dropdown is held while the scanner
 * fills and Enter fires the exact-match lookup.
 */
export function useProductScanSearch({
  perPage = 20,
  onSelect,
  onNotFound,
}: UseProductScanSearchOptions): ProductScanSearch {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id — a stale search response is ignored if a newer one
  // has fired, without needing AbortController wiring through the axios layer.
  const reqIdRef = useRef(0);

  const focus = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsSearching(false);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    reqIdRef.current++; // invalidate any in-flight search
    reset();
  }, [reset]);

  // Exact barcode lookup — the fast scan path cashiers expect: scan, Enter,
  // product lands in the cart.
  const scanByBarcode = useCallback(
    async (code: string) => {
      try {
        const { data } = await api.get<{ data: Product[] }>("products", {
          params: { search: code, per_page: 5 },
        });
        const exact = data.data.find((p) => p.barcode === code) ?? data.data[0];
        if (!exact) {
          onNotFound?.(code);
          return;
        }
        onSelect(exact);
        reset();
        focus();
      } catch {
        onNotFound?.(code);
      }
    },
    [onSelect, onNotFound, reset, focus],
  );

  // Debounced name search. Pure-numeric input longer than 6 chars is held as a
  // barcode — no dropdown flicker while the scanner streams digits.
  const onChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const v = value.trim();
      if (!v) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      if (/^\d+$/.test(v) && v.length > 6) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        const id = ++reqIdRef.current;
        setIsSearching(true);
        try {
          const { data } = await api.get<{ data: Product[] }>("products", {
            params: { search: v, per_page: perPage },
          });
          if (id !== reqIdRef.current) return; // a newer search superseded this
          setResults(data.data);
        } catch {
          if (id === reqIdRef.current) setResults([]);
        } finally {
          if (id === reqIdRef.current) setIsSearching(false);
        }
      }, 300);
    },
    [perPage],
  );

  // Enter with nothing highlighted: pick the lone result, or scan the code.
  const onSubmit = useCallback(() => {
    const v = query.trim();
    if (!v) return;
    if (results.length === 1) {
      onSelect(results[0]);
      reset();
      focus();
      return;
    }
    if (results.length > 1) return; // user must choose from the dropdown
    void scanByBarcode(v);
  }, [query, results, onSelect, scanByBarcode, reset, focus]);

  const select = useCallback(
    (product: Product) => {
      onSelect(product);
      reset();
      focus();
    },
    [onSelect, reset, focus],
  );

  return { inputRef, query, results, isSearching, onChange, onSubmit, select, clear, focus };
}