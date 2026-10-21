"use client";

import { Activity, Home, Users } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, type ShellNavGroup } from "./app-shell";

const groups: ShellNavGroup[] = [
  {
    label: "General",
    items: [{ href: "/admin", label: "Inicio", Icon: Home, exact: true }],
  },
  {
    label: "Administración",
    items: [
      { href: "/admin/tenants", label: "Tenants", Icon: Users },
      { href: "/admin/platform-status", label: "Estado de la plataforma", Icon: Activity },
    ],
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AppShell
      groups={groups}
      brandHref="/admin"
      areaLabel="Platform Admin"
      footerLabel="Platform Admin"
    >
      {children}
    </AppShell>
  );
}
