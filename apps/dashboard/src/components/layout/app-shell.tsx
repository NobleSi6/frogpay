"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "cn";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { setSession, useAuthSession } from "@/features/auth/auth-session";

export type ShellNavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  exact?: boolean;
  nested?: boolean;
  matches?: (pathname: string) => boolean;
};

export type ShellNavGroup = {
  label: string;
  items: ShellNavItem[];
};

type AppShellProps = {
  children: ReactNode;
  groups: ShellNavGroup[];
  brandHref: string;
  areaLabel: string;
  footerLabel: string;
  headerStatus?: ReactNode;
  banner?: ReactNode;
};

const COLLAPSE_KEY = "frogpay.sidebar.collapsed";

function isItemActive(item: ShellNavItem, pathname: string) {
  if (item.matches) return item.matches(pathname);
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-300 via-primary-500 to-secondary-600 text-neutral-950 shadow-lg shadow-primary-950/40 ring-1 ring-white/20",
        className,
      )}
      aria-hidden
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_55%)]" />
      <span className="relative text-lg font-black tracking-[-0.08em]">F</span>
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-white/90" />
    </span>
  );
}

function SidebarBody({
  groups,
  collapsed,
  mobile,
  pathname,
  brandHref,
  areaLabel,
  footerLabel,
  session,
  onToggleCollapse,
  onNavigate,
  onLogout,
}: {
  groups: ShellNavGroup[];
  collapsed: boolean;
  mobile: boolean;
  pathname: string;
  brandHref: string;
  areaLabel: string;
  footerLabel: string;
  session: ReturnType<typeof useAuthSession>;
  onToggleCollapse: () => void;
  onNavigate: () => void;
  onLogout: () => void;
}) {
  const email = session?.user.email ?? "";
  const initial = email.slice(0, 1).toUpperCase() || "F";

  return (
    <div className="relative flex h-full flex-col px-4 py-5">
      <div
        className={cn(
          "flex items-center gap-2",
          collapsed ? "flex-col justify-center" : "justify-between",
        )}
      >
        <Link
          href={brandHref}
          aria-label="Ir al inicio de FrogPay"
          onClick={onNavigate}
          className="inline-flex min-w-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary-300"
        >
          {collapsed ? (
            <BrandMark />
          ) : (
            <BrandLogo className="h-auto w-[216px] max-w-full" priority />
          )}
        </Link>
        {!mobile && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-300",
              collapsed && "mt-1",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
        {mobile && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Cerrar menú"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-300"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav
        aria-label={areaLabel}
        className="mt-8 flex-1 space-y-6 overflow-y-auto overflow-x-hidden pb-4"
      >
        {groups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            {!collapsed && (
              <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map(({ href, label, Icon, exact, nested, matches }) => {
                const active = isItemActive({ href, label, Icon, exact, nested, matches }, pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? label : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-primary-300",
                      collapsed ? "justify-center px-0" : "px-3",
                      nested && !collapsed && "ml-3 pl-4",
                      active
                        ? "bg-primary-500 text-white shadow-lg shadow-primary-950/30"
                        : "text-neutral-400 hover:bg-white/[0.07] hover:text-white",
                    )}
                  >
                    {active && !nested && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-200"
                      />
                    )}
                    <Icon
                      aria-hidden
                      className={cn(
                        "size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105",
                        active ? "text-white" : "text-neutral-500 group-hover:text-primary-300",
                      )}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div
        className={cn(
          "shrink-0 rounded-2xl border border-white/10 bg-white/[0.045] p-2.5",
          collapsed && "flex flex-col items-center gap-2 p-2",
        )}
      >
        {collapsed ? (
          <>
            <span
              className="flex size-9 items-center justify-center rounded-xl bg-primary-400/15 text-sm font-semibold text-primary-200"
              title={email}
            >
              {initial}
            </span>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex size-9 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-300"
            >
              <LogOut className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-400/15 text-sm font-semibold text-primary-200">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">{email || footerLabel}</p>
              <p className="truncate text-[10px] text-neutral-500">{footerLabel}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-300"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  groups,
  brandHref,
  areaLabel,
  footerLabel,
  headerStatus,
  banner,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* Keep the default expanded sidebar. */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* Storage can be unavailable in private mode. */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const allItems = groups.flatMap((group) => group.items);
  const activeItem =
    allItems.find((item) => isItemActive(item, pathname)) ??
    allItems.find((item) => pathname.startsWith(item.href));
  const pageTitle = activeItem?.label ?? areaLabel;

  function logout() {
    setSession(null);
    router.replace("/login");
  }

  const sidebarProps = {
    groups,
    pathname,
    brandHref,
    areaLabel,
    footerLabel,
    session,
    onLogout: logout,
  };

  return (
    <div className="app-canvas min-h-dvh">
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            "sidebar-surface fixed inset-y-0 left-0 z-40 hidden border-r border-white/5 text-neutral-100 transition-[width] duration-300 ease-out md:sticky md:top-0 md:flex md:h-dvh md:shrink-0",
            collapsed ? "md:w-[84px]" : "md:w-[288px]",
          )}
        >
          <div aria-hidden className="sidebar-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative z-10 flex h-full w-full flex-col">
            <SidebarBody
              {...sidebarProps}
              collapsed={collapsed}
              mobile={false}
              onToggleCollapse={() => setCollapsed((value) => !value)}
              onNavigate={() => undefined}
            />
          </div>
        </aside>

        <div
          aria-hidden
          className={cn(
            "fixed inset-0 z-40 bg-neutral-950/60 backdrop-blur-sm transition-opacity duration-200 md:hidden",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            "sidebar-surface fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[86vw] text-neutral-100 shadow-2xl transition-transform duration-300 ease-out md:hidden",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Menú de navegación"
          aria-hidden={!mobileOpen}
          inert={!mobileOpen}
        >
          <div aria-hidden className="sidebar-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative z-10 flex h-full w-full flex-col">
            <SidebarBody
              {...sidebarProps}
              collapsed={false}
              mobile
              onToggleCollapse={() => undefined}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Abrir menú"
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:hidden"
                >
                  <Menu className="size-5" />
                </button>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    <span>FrogPay</span>
                    <span aria-hidden className="text-muted-foreground/50">/</span>
                    <span className="truncate">{areaLabel}</span>
                  </p>
                  <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
                    {pageTitle}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                {headerStatus}
                <div className="hidden items-center gap-2.5 rounded-full border bg-card/80 py-1 pl-1 pr-3 shadow-sm sm:flex">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                    {(session?.user.email ?? "F").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="max-w-44 leading-tight">
                    <p className="truncate text-xs font-medium">{session?.user.email}</p>
                    <p className="text-[10px] text-muted-foreground">{footerLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {banner}
          <main className="relative mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div key={pathname} className="animate-page-enter">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
