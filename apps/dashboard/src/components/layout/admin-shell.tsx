"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleDollarSign, Home, LogOut, Settings, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { logoutMock, useMockSession } from "@/features/auth/mock-auth";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useMockSession();
  function logout() { logoutMock(); router.replace("/login"); }
  return (
    <div className="min-h-dvh md:flex">
      <aside className="bg-neutral-900 p-5 text-neutral-100 md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
        <Link href="/admin" className="mb-6 flex items-center gap-2 text-2xl font-semibold"><CircleDollarSign aria-hidden className="text-primary" />FrogPay</Link>
        <nav aria-label="Administración" className="flex flex-wrap gap-2 md:flex-col">
          {[{ href: "/admin", label: "Inicio", Icon: Home }, { href: "/admin/tenants", label: "Tenants", Icon: Users }].map(({ href, label, Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-primary text-primary-foreground" : "hover:bg-neutral-800"}`}><Icon aria-hidden className="size-5" />{label}</Link>;
          })}
          <button disabled title="Disponible en un próximo sprint" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm opacity-50"><Settings aria-hidden className="size-5" />Configuración</button>
        </nav>
        <p className="mt-6 text-xs text-neutral-400 md:mt-auto">Panel interno · FrogPay</p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:px-8"><span className="font-semibold">Platform Admin</span><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{session?.email}</span><Button variant="ghost" className="min-h-11" onClick={logout}><LogOut aria-hidden />Cerrar sesión</Button></div></header>
        <main className="mx-auto max-w-7xl p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
