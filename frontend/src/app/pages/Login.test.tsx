import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const loginMock = vi.fn();
const authState = { isAuthenticated: false, loading: false, user: null };

vi.mock("@/app/auth/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ ...authState, login: loginMock, logout: vi.fn() }),
}));

import { toast } from "sonner";
import Login from "@/app/pages/Login";
import { renderWithProviders } from "@/test/setup";

beforeEach(() => {
  loginMock.mockReset();
  loginMock.mockResolvedValue({ id: 7, name: "Aisha", role: "staff" });
  authState.isAuthenticated = false;
  authState.user = null;
  vi.mocked(toast.success).mockClear();
});

describe("Login", () => {
  it("blocks submit and shows validation errors for empty fields", async () => {
    renderWithProviders(<Login />);
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your password/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("calls login with the entered credentials", async () => {
    renderWithProviders(<Login />);
    await userEvent.type(screen.getByLabelText(/email/i), "aisha@store.test");
    await userEvent.type(screen.getByLabelText(/password/i), "secret123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginMock).toHaveBeenCalledWith("aisha@store.test", "secret123");
    // Resolve and flush the success toast.
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(expect.stringContaining("Aisha"));
  });
});