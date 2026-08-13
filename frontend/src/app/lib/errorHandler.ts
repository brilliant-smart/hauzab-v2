import { toast } from "sonner";
import { AxiosError } from "axios";

interface ApiErrorResponse {
  message?: string;
  errors?: Record<string, string[]>;
}

/**
 * Centralized API error handler.
 * Extracts a human-readable message from any error type and displays it via toast.
 */
export function handleApiError(error: unknown, fallbackMessage = "An unexpected error occurred. Please try again."): string {
  let message = fallbackMessage;

  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorResponse | undefined;

    if (data?.message) {
      message = data.message;
    } else if (data?.errors) {
      // Flatten Laravel validation errors
      const flatErrors = Object.values(data.errors).flat();
      message = flatErrors.join(" ");
    } else if (error.response?.status === 401) {
      message = "Your session has expired. Please log in again.";
    } else if (error.response?.status === 403) {
      message = "You don't have permission to perform this action.";
    } else if (error.response?.status === 404) {
      message = "The requested resource was not found.";
    } else if (error.response?.status && error.response?.status >= 500) {
      message = "A server error occurred. Please try again later.";
    } else if (!error.response) {
      message = "Network error. Please check your connection.";
    }
  } else if (error instanceof Error) {
    message = error.message || fallbackMessage;
  }

  toast.error(message);
  return message;
}