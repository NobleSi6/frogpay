import { apiRequest } from "@/lib/api-client";
import { SPRINT1_DEMO_MODE } from "@/lib/demo-mode";
import { loginMock } from "../mock-auth";
import { setSession, type AuthSession, type AuthUser } from "../auth-session";

type LoginResponse = { accessToken: string; tokenType: "Bearer"; expiresIn: number; user: AuthUser };

export async function login(email: string, password: string) {
  if (SPRINT1_DEMO_MODE) {
    const demo = loginMock(email, password);
    if (!demo) return null;
    const session: AuthSession = { accessToken: "demo", user: { id: `demo-${demo.session.role}`, email: demo.session.email, role: demo.session.role, ...(demo.session.tenant ? { tenant: { id: "demo", name: demo.session.tenant } } : {}) } };
    setSession(session);
    return { session, redirect: demo.redirect };
  }
  const response = await apiRequest<LoginResponse>("/identity/login", { method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(), password }) }, false);
  const session = { accessToken: response.accessToken, user: response.user };
  setSession(session);
  return { session, redirect: route(response.user.role) };
}

export async function validateSession() {
  const user = await apiRequest<AuthUser>("/identity/me");
  const current = typeof window === "undefined" ? null : JSON.parse(localStorage.getItem("frogpay.auth.session.v1") ?? "null") as AuthSession | null;
  if (current?.accessToken) setSession({ accessToken: current.accessToken, user });
  return user;
}

function route(role: AuthUser["role"]) { return role === "PLATFORM_ADMIN" ? "/admin" : "/dashboard"; }
