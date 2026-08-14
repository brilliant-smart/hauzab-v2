import axios from "axios";
import { tokenStorage } from "@/app/auth/token";

/**
 * Thrown by outboxApi on 401. The background drainer catches this and toasts a
 * re-login prompt instead of redirecting — so a cashier mid-sale isn't yanked
 * to the login screen when a single-session policy kills their token elsewhere.
 */
export class OutboxAuthError extends Error {
  constructor(message = "Re-login required to sync") {
    super(message);
    this.name = "OutboxAuthError";
  }
}

/**
 * Separate axios instance for offline-outbox traffic. Identical base URL and
 * token interceptor to the main `api`, but its 401 handler throws instead of
 * redirecting — background sync must never abandon a cashier mid-sale.
 */
export const outboxApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
  },
});

outboxApi.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

outboxApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      throw new OutboxAuthError();
    }
    return Promise.reject(error);
  },
);