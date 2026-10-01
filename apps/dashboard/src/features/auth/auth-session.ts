"use client";

import { useSyncExternalStore } from "react";

export type AuthRole = "PLATFORM_ADMIN" | "OWNER" | "ADMIN" | "DEVELOPER" | "FINANCE" | "SUPPORT";
export type AuthUser = { id: string; email: string; role: AuthRole; tenant?: { id: string; name: string } };
export type AuthSession = { accessToken: string; user: AuthUser };

const key = "frogpay.auth.session.v1";
const listeners = new Set<() => void>();
let cached: AuthSession | null | undefined;

function valid(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return Boolean(session.accessToken && session.user?.id && session.user.email && session.user.role);
}

export function getSession(): AuthSession | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    cached = valid(parsed) ? parsed : null;
  } catch { cached = null; }
  return cached;
}

export function setSession(session: AuthSession | null) {
  cached = session;
  if (session) localStorage.setItem(key, JSON.stringify(session));
  else localStorage.removeItem(key);
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (event: StorageEvent) => { if (event.key === key) { cached = undefined; listener(); } };
  window.addEventListener("storage", storage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", storage); };
}

export function useAuthSession() {
  return useSyncExternalStore<AuthSession | null | undefined>(subscribe, getSession, () => undefined);
}

export function routeForRole(role: AuthRole) {
  return role === "PLATFORM_ADMIN" ? "/admin" : "/dashboard";
}
