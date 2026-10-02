"use client";

export type MockRole = "PLATFORM_ADMIN" | "OWNER";
export type MockSession = {
  email: string;
  role: MockRole;
  tenant?: string;
};

type MockUser = MockSession & { password: string; redirect: "/admin" | "/dashboard" };

export const MOCK_USERS: readonly MockUser[] = [
  { email: "admin@frogpay.test", password: "Admin123!", role: "PLATFORM_ADMIN", redirect: "/admin" },
  { email: "owner@acme.test", password: "Owner123!", role: "OWNER", tenant: "Acme Bolivia SRL", redirect: "/dashboard" },
];

export function loginMock(email: string, password: string) {
  const user = MOCK_USERS.find((candidate) => candidate.email === email.trim().toLowerCase() && candidate.password === password);
  if (!user) return null;
  const session: MockSession = { email: user.email, role: user.role, ...(user.tenant ? { tenant: user.tenant } : {}) };
  return { session, redirect: user.redirect };
}
