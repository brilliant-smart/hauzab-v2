import { ReactNode, useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function today(): string {
  return toISO(new Date());
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
}

// Which quick preset matches the currently applied range, for chip highlight.
function presetOf(from: string, to: string): string | null {
  if (!from && !to) return "all";
  const t = today();
  if (from === t && to === t) return "today";
  if (from === daysAgo(1) && to === daysAgo(1)) return "yesterday";
  if (from === daysAgo(6) && to === t) return "7d";
  if (from === daysAgo(29) && to === t) return "30d";
  return null;
}

const PRESETS: { key: string; label: string; from: string; to: string }[] = [
  { key: "today", label: "Today", from: today(), to: today() },
  { key: "yesterday", label: "Yesterday", from: daysAgo(1), to: daysAgo(1) },
  { key: "7d", label: "7 Days", from: daysAgo(6), to: today() },
  { key: "30d", label: "30 Days", from: daysAgo(29), to: today() },
  { key: "all", label: "All Time", from: "", to: "" },
];

interface DateRangeFilterProps {
  /** Currently applied range (drives the active-preset highlight). */
  from: string;
  to: string;
  /** Apply a new range (from a Filter click or a preset). */
  onApply: (from: string, to: string) => void;
  /** Optional extra controls rendered to the right of the Filter button. */
  actions?: ReactNode;
}

/**
 * From/To date filter with a Filter button (toasts "Fill Date correctly" if
 * either side is blank) and quick-preset chips (Today / Yesterday / 7 Days /
 * 30 Days / All Time). The pickers hold a draft that only becomes the applied
 * range on Filter; presets apply immediately. "All Time" applies an empty
 * range, which the report endpoints treat as unfiltered (open on both sides).
 */
export function DateRangeFilter({ from, to, onApply, actions }: DateRangeFilterProps) {
  const [fromInput, setFromInput] = useState(from);
  const [toInput, setToInput] = useState(to);

  // Keep the draft in sync when the applied range changes from outside
  // (e.g. a preset click or a parent reset).
  useEffect(() => {
    setFromInput(from);
    setToInput(to);
  }, [from, to]);

  const runFilter = () => {
    if (!fromInput || !toInput) {
      toast.error("Fill Date correctly");
      return;
    }
    onApply(fromInput, toInput);
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setFromInput(p.from);
    setToInput(p.to);
    onApply(p.from, p.to);
  };

  const activePreset = presetOf(from, to);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">From</label>
          <DatePicker value={fromInput} onChange={setFromInput} className="w-44" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">To</label>
          <DatePicker value={toInput} onChange={setToInput} className="w-44" />
        </div>
        <Button type="button" onClick={runFilter}>
          <Filter className="size-4" /> Filter
        </Button>
        {actions && <div className="ml-auto flex items-end gap-2">{actions}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Quick:</span>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={activePreset === p.key ? "default" : "outline"}
            size="sm"
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}