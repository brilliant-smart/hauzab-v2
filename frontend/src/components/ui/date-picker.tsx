import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseLocalDate } from "@/utils/date";

interface DatePickerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange"> {
  /** Stored value in ISO yyyy-mm-dd (the form/backend format). */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Popover anchor relative to the trigger — "end" opens flush-right. */
  align?: "start" | "center" | "end";
}

// Formats a local Date back to the yyyy-mm-dd string the API expects, avoiding
// the UTC drift of toISOString().
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Single-date picker: a full-width input-styled trigger with the placeholder
 * on the left and a calendar icon on the right, opening a popover calendar.
 * Displays MM/DD/YYYY; stores/returns YYYY-MM-DD.
 */
export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  function DatePicker(
    {
      value,
      onChange,
      placeholder = "mm/dd/yyyy",
      className,
      align = "end",
      disabled,
      ...props
    },
    ref,
  ) {
    const [open, setOpen] = React.useState(false);
    const selected = value ? parseLocalDate(value) : undefined;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-9 w-full justify-between px-3 py-2 text-left font-normal",
              !value && "text-muted-foreground",
              className,
            )}
            {...props}
          >
            <span>{value ? format(selected!, "MM/dd/yyyy") : placeholder}</span>
            <CalendarIcon className="size-4 shrink-0 opacity-70" />
          </Button>
        </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? toISO(date) : "");
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
  },
);