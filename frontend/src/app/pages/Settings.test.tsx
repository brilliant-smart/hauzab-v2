import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { authState, getProfileMock, updateProfileMock, changePasswordMock } = vi.hoisted(() => {
  const authState = { isAuthenticated: true, loading: false, user: { id: 1, name: "Aisha", email: "aisha@store.test", role: "staff" as const, tenant: { id: 1, name: "Store" } } };
  return {
    authState,
    getProfileMock: vi.fn(),
    updateProfileMock: vi.fn(),
    changePasswordMock: vi.fn(),
  };
});

vi.mock("@/app/auth/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ ...authState, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock("@/app/api/auth", () => ({
  getProfile: getProfileMock,
  updateProfile: updateProfileMock,
  changePasswordRequest: changePasswordMock,
}));

import { toast } from "sonner";
import { renderWithProviders } from "@/test/setup";
import Settings from "@/app/pages/Settings";

beforeEach(() => {
  getProfileMock.mockReset();
  updateProfileMock.mockReset();
  changePasswordMock.mockReset();
  vi.mocked(toast.success).mockClear();

  getProfileMock.mockResolvedValue({
    data: {
      user: { id: 1, name: "Aisha", email: "aisha@store.test", role: "staff", tenant_id: 1 },
      profile: { fullname: "Aisha Bello", phone: "08010000000", address: "12 Market Road" },
    },
  });
  updateProfileMock.mockResolvedValue({ data: { user: { id: 1, name: "Aisha", email: "aisha@store.test" }, profile: {} } });
  changePasswordMock.mockResolvedValue({ data: {} });
});

describe("Settings", () => {
  it("loads the profile into the form", async () => {
    renderWithProviders(<Settings />);

    expect(await screen.findByDisplayValue(/Aisha Bello/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("08010000000")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/12 Market Road/i)).toBeInTheDocument();
  });

  it("requires the current password before changing", async () => {
    renderWithProviders(<Settings />);

    await screen.findByDisplayValue(/Aisha Bello/i);
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(screen.getByText(/enter your current password/i)).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters", async () => {
    renderWithProviders(<Settings />);

    await screen.findByDisplayValue(/Aisha Bello/i);
    await userEvent.type(screen.getByLabelText(/current password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/^new password$/i), "short");
    await userEvent.click(screen.getByRole("button", { name: /update password/i }));

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("saves the profile fields", async () => {
    renderWithProviders(<Settings />);

    await screen.findByDisplayValue(/Aisha Bello/i);
    await userEvent.clear(screen.getByLabelText(/phone/i));
    await userEvent.type(screen.getByLabelText(/phone/i), "08020000000");
    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await screen.findByText("Profile saved", { exact: false }).catch(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(updateProfileMock).toHaveBeenCalled();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Profile saved");
  });
});