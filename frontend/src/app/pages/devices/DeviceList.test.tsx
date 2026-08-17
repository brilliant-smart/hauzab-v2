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

vi.mock("@/app/api/devices", () => ({
  useDevices: () => ({
    data: [
      { id: 3, name: "Front Till", branch_id: null, is_active: true, last_seen_at: null, branch: null },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSaveDevice: () => saveMock,
  useDeleteDevice: () => deleteMock,
}));

vi.mock("@/app/api/branches", () => ({
  useBranches: () => ({ data: [{ id: 1, name: "Main" }] }),
}));

import { renderWithProviders } from "@/test/setup";
import DeviceList from "@/app/pages/devices/DeviceList";

beforeEach(() => {
  saveMock.mutate.mockReset();
  deleteMock.mutate.mockReset();
});

describe("DeviceList", () => {
  it("renders devices from the hook", () => {
    renderWithProviders(<DeviceList />);

    expect(screen.getByText("Front Till")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("opens the add dialog and submits a new device", async () => {
    renderWithProviders(<DeviceList />);

    await userEvent.click(screen.getByRole("button", { name: /add device/i }));
    await userEvent.type(screen.getByLabelText(/name \*/i), "Back Till");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(saveMock.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ name: "Back Till" }) }),
      expect.any(Object),
    );
  });

  it("deletes a device after confirming", async () => {
    renderWithProviders(<DeviceList />);

    const row = screen.getByText("Front Till").closest("tr")!;
    const buttons = within(row).getAllByRole("button");
    await userEvent.click(buttons[1]);

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(deleteMock.mutate).toHaveBeenCalledWith(3, expect.any(Object));
  });
});