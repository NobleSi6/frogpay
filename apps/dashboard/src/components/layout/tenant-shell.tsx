"use client";

import {
  CreditCard,
  Home,
  KeyRound,
  ReceiptText,
  Scale,
  ScrollText,
  Settings,
  Sparkles,
  Store,
  Webhook,
} from "lucide-react";
import type { ReactNode } from "react";
import { EnvironmentBadge, SandboxBanner } from "@/components/shared/environment-indicator";
import { useTenantEnvironment } from "@/features/provider-credentials/environment-context";
import { AppShell, type ShellNavGroup } from "./app-shell";

const isPaymentFlow = (pathname: string) =>
  pathname === "/dashboard/pagos" ||
  (pathname.startsWith("/dashboard/pagos/") &&
    !pathname.startsWith("/dashboard/pagos/transacciones") &&
    !pathname.startsWith("/dashboard/pagos/conciliacion"));

const groups: ShellNavGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/dashboard", label: "Inicio", Icon: Home, exact: true },
      { href: "/dashboard/pagos", label: "Pagos", Icon: CreditCard, matches: isPaymentFlow },
      {
        href: "/dashboard/pagos/transacciones",
        label: "Transacciones",
        Icon: ReceiptText,
        exact: true,
        nested: true,
      },
      { href: "/dashboard/pagos/conciliacion", label: "Conciliación", Icon: Scale },
    ],
  },
  {
    label: "Desarrollo",
    items: [
      { href: "/dashboard/auditoria", label: "Auditoría", Icon: ScrollText },
      { href: "/dashboard/api-keys", label: "API Keys", Icon: KeyRound },
      { href: "/dashboard/webhooks", label: "Webhooks", Icon: Webhook },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { href: "/dashboard/configuracion/proveedores", label: "Proveedores", Icon: Store },
      { href: "/dashboard/plan", label: "Plan", Icon: Sparkles },
      { href: "/dashboard/configuracion", label: "Configuración", Icon: Settings, exact: true },
    ],
  },
];

export function TenantShell({ children }: { children: ReactNode }) {
  const { environment } = useTenantEnvironment();

  return (
    <AppShell
      groups={groups}
      brandHref="/dashboard"
      areaLabel="Tenant Owner"
      footerLabel="Tenant Owner"
      headerStatus={<EnvironmentBadge environment={environment} />}
      banner={<SandboxBanner environment={environment} />}
    >
      {children}
    </AppShell>
  );
}
