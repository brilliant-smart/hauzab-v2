import { api } from "@/app/lib/api";

export const loginRequest = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

export const logoutRequest = () => api.post("/auth/logout");

export const forgotPassword = (email: string) =>
  api.post("/auth/forgot-password", { email });

export const resetPassword = (data: {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}) => api.post("/auth/reset-password", data);

export const changePasswordRequest = (data: {
  current_password: string;
  new_password: string;
}) => api.post("/auth/change-password", data);

export interface UserProfileData {
  fullname?: string | null;
  gender?: string | null;
  address?: string | null;
  phone?: string | null;
  qualification?: string | null;
  designation?: string | null;
  state?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  bank_name?: string | null;
  salary?: string | number | null;
}

export interface ProfileResponse {
  user: import("@/app/auth/types").User;
  profile: UserProfileData & { id?: number };
}

export const getProfile = () => api.get<ProfileResponse>("/auth/profile");

export const updateProfile = (data: {
  name: string;
  email: string;
  profile?: UserProfileData;
}) => api.put<ProfileResponse>("/auth/profile", data);