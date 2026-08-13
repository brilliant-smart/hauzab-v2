import { loginRequest, logoutRequest } from "@/app/api/auth";
import { User } from "./types";
import { api } from "@/app/lib/api";

interface LoginResponse {
  token: string;
  user: User;
}

export async function login(email: string, password: string) {
  const response = await loginRequest(email, password);
  const data = response.data as LoginResponse;

  return { token: data.token, user: data.user };
}

export async function logout(): Promise<boolean> {
  // Backend logout may fail (token already expired); the frontend clears
  // local state regardless, so a failed request must not block logout.
  try {
    await logoutRequest();
  } catch {
    // ignore
  }

  return true;
}

export async function me(): Promise<User> {
  const res = await api.get("/auth/me");
  return res.data.user as User;
}