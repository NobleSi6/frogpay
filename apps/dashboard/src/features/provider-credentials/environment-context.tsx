"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { PaymentEnvironment } from "./provider-credentials-client";

const STORAGE_KEY = "frogpay.tenant.environment.v1";
const listeners = new Set<() => void>();
type EnvironmentContextValue = { environment: PaymentEnvironment; setEnvironment: (environment: PaymentEnvironment) => void };
const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function getEnvironment(): PaymentEnvironment {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "production" ? "production" : "sandbox";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function TenantEnvironmentProvider({ children }: { children: ReactNode }) {
  const environment = useSyncExternalStore<PaymentEnvironment>(subscribe, getEnvironment, () => "sandbox");

  function setEnvironment(next: PaymentEnvironment) {
    localStorage.setItem(STORAGE_KEY, next);
    listeners.forEach((listener) => listener());
  }

  return <EnvironmentContext.Provider value={{ environment, setEnvironment }}>{children}</EnvironmentContext.Provider>;
}

export function useTenantEnvironment() {
  const context = useContext(EnvironmentContext);
  if (!context) throw new Error("useTenantEnvironment debe usarse dentro de TenantEnvironmentProvider");
  return context;
}
