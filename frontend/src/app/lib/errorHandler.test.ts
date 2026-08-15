import { describe, it, expect, vi, beforeEach } from "vitest";
import { AxiosError, type AxiosResponse } from "axios";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from "sonner";
import { handleApiError } from "@/app/lib/errorHandler";

function axiosError(data: unknown, status: number): AxiosError {
  const response = { data, status, statusText: "", headers: {}, config: {} } as AxiosResponse;
  return new AxiosError("err", "ERR", undefined, undefined, response);
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
});

describe("handleApiError", () => {
  it("flattens 422 Laravel validation errors into one message", () => {
    const err = axiosError(
      { errors: { email: ["Email is required."], password: ["Too short."] } },
      422,
    );
    const msg = handleApiError(err);
    expect(msg).toContain("Email is required.");
    expect(msg).toContain("Too short.");
    expect(toast.error).toHaveBeenCalledWith(msg);
  });

  it("prefers the server message when present", () => {
    const err = axiosError({ message: "Stock too low." }, 422);
    expect(handleApiError(err)).toBe("Stock too low.");
  });

  it("maps 401 to an expired-session message", () => {
    expect(handleApiError(axiosError({}, 401))).toBe("Your session has expired. Please log in again.");
  });

  it("maps 403 to a permission message", () => {
    expect(handleApiError(axiosError({}, 403))).toBe("You don't have permission to perform this action.");
  });

  it("maps 404 to a not-found message", () => {
    expect(handleApiError(axiosError({}, 404))).toBe("The requested resource was not found.");
  });

  it("maps 5xx to a server-error message", () => {
    expect(handleApiError(axiosError({}, 500))).toBe("A server error occurred. Please try again later.");
  });

  it("maps a network failure (no response) to a network message", () => {
    expect(handleApiError(new AxiosError("network", "ERR"))).toBe("Network error. Please check your connection.");
  });

  it("falls back to the Error message for non-Axios errors", () => {
    expect(handleApiError(new Error("boom"))).toBe("boom");
  });

  it("uses the fallback message when nothing else applies", () => {
    const fallback = "Custom fallback.";
    expect(handleApiError(new Error(""), fallback)).toBe(fallback);
    expect(toast.error).toHaveBeenCalledWith(fallback);
  });
});