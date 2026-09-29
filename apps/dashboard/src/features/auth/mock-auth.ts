"use client";

import { useSyncExternalStore } from "react";

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

const storageKey = "frogpay.sprint1.mock-session";
const listeners = new Set<() => void>();
let cachedSession: MockSession | null | undefined;

function isMockSession(value: unknown): value is MockSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<MockSession>;
  return MOCK_USERS.some((user) => user.email === session.email && user.role === session.role && user.tenant === session.tenant);
}

function readSession(): MockSession | null {
  if (cachedSession !== undefined) return cachedSession;
  if (typeof window === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    cachedSession = isMockSession(parsed) ? parsed : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey) {
      cachedSession = undefined;
      listener();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function publish(session: MockSession | null) {
  cachedSession = session;
  if (session) localStorage.setItem(storageKey, JSON.stringify(session));
  else localStorage.removeItem(storageKey);
  listeners.forEach((listener) => listener());
}

export function loginMock(email: string, password: string) {
  const user = MOCK_USERS.find((candidate) => candidate.email === email.trim().toLowerCase() && candidate.password === password);
  if (!user) return null;
  const session: MockSession = { email: user.email, role: user.role, ...(user.tenant ? { tenant: user.tenant } : {}) };
  publish(session);
  return { session, redirect: user.redirect };
}

export function logoutMock() {
  publish(null);
}

export function useMockSession() {
  return useSyncExternalStore<MockSession | null | undefined>(subscribe, readSession, () => undefined);
}

export function routeForRole(role: MockRole) {
  return role === "PLATFORM_ADMIN" ? "/admin" : "/dashboard";
}
