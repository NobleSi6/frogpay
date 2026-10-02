"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { routeForRole, setSession, type AuthRole, useAuthSession } from "../auth-session";
import { validateSession } from "../services/login-service";
import { SPRINT1_DEMO_MODE } from "@/lib/demo-mode";

export function AuthGuard({ role, children }: { role: AuthRole; children: ReactNode }) {
  const router = useRouter();
  const session = useAuthSession();
  const validatedToken = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!SPRINT1_DEMO_MODE && session?.accessToken && session.accessToken !== "demo" && validatedToken.current !== session.accessToken) {
      validatedToken.current = session.accessToken;
      void validateSession().catch(() => setSession(null));
    }
  }, [session?.accessToken]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) router.replace("/login");
    else if (session.user.role !== role) router.replace(routeForRole(session.user.role));
  }, [role, router, session]);

  if (!session || session.user.role !== role) {
    return <main className="flex min-h-dvh items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle aria-hidden className="size-4 animate-spin" />Validando sesión…</main>;
  }
  return children;
}