"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { backendIntegrationEnabled } from "@/lib/api-client";
import { createTenant, listTenants, type TenantDraft } from "../services/tenant-service";

type Tenant = { id: string; company: string; email: string; status: "Invitado" | "Activo"; created: string };
const initialTenants: Tenant[] = [
  { id: "1", company: "Acme Pagos", email: "carlos@acmepagos.com", status: "Invitado", created: "24 oct 2024" },
  { id: "2", company: "Kushki Pro", email: "kushki@kushkipro.com", status: "Invitado", created: "19 oct 2024" },
  { id: "3", company: "FinTech Co", email: "owner@fintechco.co", status: "Activo", created: "22 oct 2024" },
  { id: "4", company: "Yape Fast", email: "admin@yapefast.pe", status: "Activo", created: "20 oct 2024" },
  { id: "5", company: "Platzi Pay", email: "owner@platzipay.com", status: "Activo", created: "15 oct 2024" },
];
const TenantContext = createContext<{ tenants: Tenant[]; addTenant: (draft: TenantDraft) => Promise<void>; error: string } | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>(backendIntegrationEnabled ? [] : initialTenants);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!backendIntegrationEnabled) return;
    let active = true;
    void listTenants().then(rows => {
      if (active) setTenants(rows.map(row => ({ id: row.id, company: row.name, email: row.ownerEmail, status: row.status === "active" ? "Activo" : "Invitado", created: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(row.createdAt)) })));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los tenants."); });
    return () => { active = false; };
  }, []);
  async function addTenant(draft: TenantDraft) {
    const result = backendIntegrationEnabled ? await createTenant(draft) : null;
    if (!result) await new Promise(resolve => setTimeout(resolve, 1200));
    setTenants((current) => [{ id: result?.id ?? crypto.randomUUID(), company: result?.name ?? draft.company.trim(), email: result?.contactEmail ?? draft.email.trim(), status: "Invitado", created: new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(result ? new Date(result.createdAt) : new Date()) }, ...current]);
  }
  return <TenantContext.Provider value={{ tenants, addTenant, error }}>{children}</TenantContext.Provider>;
}

export function useTenants() {
  const context = useContext(TenantContext);
  if (!context) throw new Error("TenantProvider es requerido");
  return context;
}
