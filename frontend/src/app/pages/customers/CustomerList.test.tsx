import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { saveMock, deleteMock } = vi.hoisted(() => ({
  saveMock: { mutate: vi.fn() },
  deleteMock: { mutate: vi.fn() },
}));

vi.mock("@/app/api/customers", () => ({
  useCustomers: () => ({
    data: {
      data: [
        { id: 7, name: "Aisha Bello", phone: "08010000000", email: null, address: "12 Market Rd" },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      from: 1,
      to: 1,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveCustomer: () => saveMock,
  useDeleteCustomer: () => deleteMock,
}));

import { renderWithProviders } from "@/test/setup";
import CustomerList from "@/app/pages/customers/CustomerList";

beforeEach(() => {
  saveMock.mutate.mockReset();
  deleteMock.mutate.mockReset();
});

describe("CustomerList", () => {
  it("renders customers from the hook", () => {
    renderWithProviders(<CustomerList />);

    expect(screen.getByText("Aisha Bello")).toBeInTheDocument();
    expect(screen.getByText("08010000000")).toBeInTheDocument();
  });

  it("opens the add dialog and submits a new customer", async () => {
    renderWithProviders(<CustomerList />);

    await userEvent.click(screen.getByRole("button", { name: /add customer/i }));
    await userEvent.type(screen.getByLabelText(/name \*/i), "New Customer");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(saveMock.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ name: "New Customer" }) }),
      expect.any(Object),
    );
  });

  it("deletes a customer after confirming", async () => {
    renderWithProviders(<CustomerList />);

    const row = screen.getByText("Aisha Bello").closest("tr")!;
    const buttons = within(row).getAllByRole("button");
    // Edit is first; the trash trigger is second.
    await userEvent.click(buttons[1]);

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(deleteMock.mutate).toHaveBeenCalledWith(7, expect.any(Object));
  });
});