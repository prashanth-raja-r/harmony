import api from "@/lib/axios";
import type { AuthResponse } from "@/types";

// SHA-256 hash via Web Crypto API — password never travels as plaintext
async function hashPassword(plain: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(plain),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const authApi = {
  sendOtp: async (email: string, type: "SIGNUP" | "LOGIN") => {
    const { data } = await api.post<{ message: string }>("/auth/send-otp", { email, type });
    return data;
  },
  verifySignupOtp: async (email: string, code: string) => {
    const { data } = await api.post<{ signupToken: string }>("/auth/verify-signup-otp", { email, code });
    return data;
  },
  signup: async (name: string, email: string, password: string, signupToken: string) => {
    const { data } = await api.post<AuthResponse>("/auth/signup", {
      name,
      email,
      password: await hashPassword(password),
      signupToken,
    });
    return data;
  },
  login: async (email: string, password: string) => {
    const { data } = await api.post<{ status: "otp_sent" }>("/auth/login", {
      email,
      password: await hashPassword(password),
    });
    return data;
  },
  verifyLoginOtp: async (email: string, code: string) => {
    const { data } = await api.post<AuthResponse>("/auth/verify-login-otp", { email, code });
    return data;
  },
  forgotPassword: async (email: string) => {
    const { data } = await api.post<{ message: string }>("/auth/forgot-password", { email });
    return data;
  },
  resetPassword: async (token: string, newPassword: string) => {
    const { data } = await api.post<{ message: string }>("/auth/reset-password", {
      token,
      newPassword: await hashPassword(newPassword),
    });
    return data;
  },
};
