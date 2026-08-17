import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { forgotPasswordMock } = vi.hoisted(() => ({ forgotPasswordMock: vi.fn() }));
vi.mock("@/app/api/auth", () => ({
  forgotPassword: forgotPasswordMock,
}));

import { renderWithProviders } from "@/test/setup";
import ForgotPassword from "@/app/pages/ForgotPassword";

beforeEach(() => {
  forgotPasswordMock.mockReset();
  forgotPasswordMock.mockResolvedValue({});
});

describe("ForgotPassword", () => {
  it("blocks submit and shows a validation error for an empty email", async () => {
    renderWithProviders(<ForgotPassword />);

    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(forgotPasswordMock).not.toHaveBeenCalled();
  });

  it("submits the email and shows the confirmation state", async () => {
    renderWithProviders(<ForgotPassword />);

    await userEvent.type(screen.getByLabelText(/email/i), "aisha@store.test");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(forgotPasswordMock).toHaveBeenCalledWith("aisha@store.test");
    expect(await screen.findByText(/reset link has been sent/i)).toBeInTheDocument();
  });
});