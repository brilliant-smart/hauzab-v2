import axios from "axios";
import { tokenStorage } from "@/app/auth/token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: {
    Accept: "application/json",
  },
});

// Attach the bearer token to every request.
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use((response) => {
  // Laravel's ResourceCollection paginator wraps results as {data, links, meta}.
  // Flatten that envelope into the top-level Paginated shape the rest of the app
  // is typed against, preserving any extra top-level keys the controller added
  // (e.g. the report endpoints' `sums`). Plain {data: [...]} lists and
  // single-resource responses have no meta.current_page and pass through untouched.
  const body = response.data;
  if (
    body &&
    typeof body === "object" &&
    Array.isArray(body.data) &&
    body.meta &&
    typeof body.meta.current_page === "number"
  ) {
    response.data = {
      ...body,
      current_page: body.meta.current_page,
      last_page: body.meta.last_page,
      per_page: body.meta.per_page,
      total: body.meta.total,
      from: body.meta.from,
      to: body.meta.to,
    };
  }
  return response;
}, (error) => {
  if (error.response?.status === 401) {
    tokenStorage.clear();
    window.location.href = "/login";
  }
  return Promise.reject(error);
});