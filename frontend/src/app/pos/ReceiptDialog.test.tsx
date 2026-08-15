import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceiptDialog, toVM, FORMAT_CONFIG, type ReceiptFormat } from "@/app/pos/ReceiptDialog";
import type { Order, ProvisionalOrder } from "@/app/api/types";
import { renderWithProviders } from "@/test/setup";

const serverOrder: Order = {
  id: 1,
  is_provisional: false,
  number: "INV-000001",
  uuid: "u1",
  status: { value: "completed", label: "Completed" },
  subtotal: "100",
  discount: "0",
  total: "100",
  amount_paid: "100",
  change: "0",
  customer_id: null,
  customer_name: null,
  note: null,
  items: [
    { id: 1, product_id: 1, product_name: "Soda", quantity: "2", unit_price: "50", line_total: "100" },
  ],
  payments: [{ id: 1, method: { value: "cash", label: "Cash" }, amount: "100" }],
  user: { id: 1, name: "Aisha" },
  tenant: { id: 1, name: "Hauzab Supermarket" },
  created_at: "2026-08-15T10:00:00Z",
};

const provisional: ProvisionalOrder = {
  is_provisional: true,
  uuid: "u2",
  provisional_number: "PENDING-1",
  subtotal: 60,
  discount: 0,
  total: 60,
  amount_paid: 60,
  change: 0,
  customer_name: null,
  items: [{ product_name: "Bread", quantity: 1, unit_price: 60, line_total: 60 }],
  payments: [{ method: "cash", amount: 60 }],
  user: { id: 1, name: "Aisha" },
  tenant: { id: 1, name: "Hauzab Supermarket" },
  created_at: "2026-08-15T10:00:00Z",
};

beforeEach(() => {
  document.getElementById("receipt-print-style")?.remove();
});

describe("FORMAT_CONFIG", () => {
  it("defines a @page size for 58mm, 80mm and A4", () => {
    expect(FORMAT_CONFIG["58mm"].page).toBe("58mm auto");
    expect(FORMAT_CONFIG["80mm"].page).toBe("80mm auto");
    expect(FORMAT_CONFIG.a4.page).toBe("A4");
    (["58mm", "80mm", "a4"] as ReceiptFormat[]).forEach((f) => {
      expect(FORMAT_CONFIG[f].width).toBeTruthy();
      expect(FORMAT_CONFIG[f].font).toBeGreaterThan(0);
    });
  });
});

describe("toVM normalization", () => {
  it("normalizes a server Order to a non-provisional view model", () => {
    const vm = toVM(serverOrder);
    expect(vm.isProvisional).toBe(false);
    expect(vm.number).toBe("INV-000001");
    expect(vm.statusLabel).toBe("Completed");
    expect(vm.items[0]).toEqual({ name: "Soda", qty: 2, unitPrice: 50, lineTotal: 100 });
    expect(vm.payments).toEqual([{ method: "cash", amount: 100 }]);
  });

  it("normalizes an offline ProvisionalOrder with a pending-sync label", () => {
    const vm = toVM(provisional);
    expect(vm.isProvisional).toBe(true);
    expect(vm.number).toBe("PENDING-1");
    expect(vm.statusLabel).toBe("Pending sync");
    expect(vm.items[0].name).toBe("Bread");
  });
});

describe("ReceiptDialog rendering", () => {
  it("renders the server order number and status", () => {
    renderWithProviders(
      <ReceiptDialog order={serverOrder} open onOpenChange={vi.fn()} />,
    );
    // The number shows in both the dialog title and the receipt body.
    expect(screen.getAllByText(/INV-000001/).length).toBeGreaterThan(0);
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });

  it("renders the provisional banner and number for an offline sale", () => {
    renderWithProviders(
      <ReceiptDialog order={provisional} open onOpenChange={vi.fn()} />,
    );
    expect(screen.getAllByText(/PENDING-1/).length).toBeGreaterThan(0);
    expect(screen.getByText("PENDING SYNC")).toBeInTheDocument();
  });

  it("injects an @page rule sized to the chosen paper on print", async () => {
    renderWithProviders(
      <ReceiptDialog order={serverOrder} open onOpenChange={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /print/i }));
    const style = document.getElementById("receipt-print-style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("@page");
    expect(style!.textContent).toContain("80mm auto");
  });
});