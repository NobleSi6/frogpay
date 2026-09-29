"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { routeForRole, type MockRole, useMockSession } from "../mock-auth";

export function MockAuthGuard({ role, children }: { role: MockRole; children: ReactNode }) {
  const router = useRouter();
  const session = useMockSession();

  useEffect(() => {
    if (session === undefined) return;
    if (!session) router.replace("/login");
    else if (session.role !== role) router.replace(routeForRole(session.role));
  }, [role, router, session]);

  if (!session || session.role !== role) {
    return <main className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden className="size-4 animate-spin" />Validando sesión demo…</main>;
  }
  return children;
}
