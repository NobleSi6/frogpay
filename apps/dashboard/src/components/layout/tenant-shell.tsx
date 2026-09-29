"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, CreditCard, KeyRound, LogOut, Webhook, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { logoutMock, useMockSession } from "@/features/auth/mock-auth";

const links = [
  { href: "/dashboard", label: "Inicio", Icon: Home },
  { href: "/dashboard/pagos", label: "Pagos", Icon: CreditCard },
  { href: "/dashboard/api-keys", label: "API Keys", Icon: KeyRound },
  { href: "/dashboard/webhooks", label: "Webhooks", Icon: Webhook },
  { href: "/dashboard/configuracion", label: "Configuración", Icon: Settings },
];
export function TenantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useMockSession();
  function logout() { logoutMock(); router.replace("/login"); }
  return <div className="min-h-dvh md:flex">
    <aside className="bg-neutral-900 p-5 text-neutral-100 md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
      <Link href="/dashboard" aria-label="Inicio de FrogPay" className="mb-6 inline-flex w-full items-center"><BrandLogo className="h-auto w-full" priority /></Link>
      <nav aria-label="Tenant" className="flex flex-wrap gap-2 md:flex-col">{links.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${pathname === href ? "bg-primary text-primary-foreground" : "hover:bg-neutral-800"}`}><Icon aria-hidden className="size-5" />{label}</Link>)}</nav>
      <p className="mt-6 text-xs text-neutral-400 md:mt-auto">Tenant Owner</p>
    </aside>
    <div className="min-w-0 flex-1"><header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-8"><span className="font-semibold">{session?.tenant}</span><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{session?.email}</span><Button variant="ghost" className="min-h-11" onClick={logout}><LogOut aria-hidden />Cerrar sesión</Button></div></header><main className="mx-auto max-w-6xl p-4 sm:p-8">{children}</main></div>
  </div>;
}
