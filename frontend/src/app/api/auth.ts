import { api } from "@/app/lib/api";

export const loginRequest = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

export const logoutRequest = () => api.post("/auth/logout");