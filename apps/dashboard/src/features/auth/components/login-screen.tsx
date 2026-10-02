"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthBrand } from "./auth-brand";
import { AuthField } from "./auth-field";
import { routeForRole, useAuthSession } from "../auth-session";
import { login } from "../services/login-service";
import { SPRINT1_DEMO_MODE } from "@/lib/demo-mode";
import { ApiError } from "@/lib/api-client";

export function LoginScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [status, setStatus] = useState<"default" | "loading" | "error">("default");
  const [recovery, setRecovery] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Correo o contraseña incorrectos.");
  const loading = status === "loading";
  const emailError = !email.trim() ? "El email es obligatorio." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? "Ingresa un email válido." : undefined;

  useEffect(() => { if (session) router.replace(routeForRole(session.user.role)); }, [router, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setTouched({ email: true, password: true });
    if (emailError || !password) return;
    setStatus("loading");
    setErrorMessage("Correo o contraseña incorrectos.");
    try {
      const result = await login(email, password);
      if (!result) setStatus("error");
      else router.replace(result.redirect);
    } catch (error) {
      setErrorMessage(error instanceof ApiError && error.status === 401 ? "Correo o contraseña incorrectos." : error instanceof Error ? error.message : "No se pudo iniciar sesión.");
      setStatus("error");
    }
  }

  return <section aria-labelledby="login-title" className="flex min-w-0 flex-col gap-7">
    <header className="flex flex-col items-center gap-5 text-center">
      <AuthBrand />
      <div className="space-y-2">
        <h1 id="login-title" className="text-2xl font-semibold">Inicia sesión</h1>
        <p className="text-sm text-muted-foreground">Acceso exclusivo para Platform Admin y Tenant Owner</p>
      </div>
    </header>
    <form noValidate onSubmit={submit} aria-busy={loading} className="flex flex-col gap-5">
      {SPRINT1_DEMO_MODE && <p className="text-xs text-muted-foreground">Modo demo local. Esta sesión no es autenticación de producción.</p>}
      <AuthField id="login-email" label="Email" name="email" type="email" autoComplete="username"
        autoCapitalize="none" spellCheck={false} placeholder="nombre@empresa.com" required disabled={loading}
        value={email} error={touched.email ? emailError : undefined}
        onBlur={() => setTouched(value => ({ ...value, email: true }))}
        onChange={event => { setEmail(event.target.value); setStatus("default"); }} />
      <AuthField id="login-password" label="Contraseña" name="password" type="password" autoComplete="current-password"
        placeholder="••••••••••••" required disabled={loading} value={password}
        error={touched.password && !password ? "La contraseña es obligatoria." : undefined}
        onBlur={() => setTouched(value => ({ ...value, password: true }))}
        onChange={event => { setPassword(event.target.value); setStatus("default"); }} />
      {status === "error" && <Alert variant="destructive"><AlertDescription>{errorMessage}</AlertDescription></Alert>}
      <Button type="submit" aria-label={loading ? "Procesando" : "Iniciar sesión"} disabled={loading || !email.trim() || !password} className="h-12 w-full">
        {loading && <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" />}
        <span role="status">{loading ? "Procesando" : "Iniciar sesión"}</span>
      </Button>
      <a href="#recuperar-acceso" aria-expanded={recovery} aria-controls="recuperar-acceso"
        className="rounded text-center text-sm font-medium text-primary-700 hover:underline focus-visible:outline-ring"
        onClick={event => { event.preventDefault(); setRecovery(value => !value); }}>¿Olvidaste tu contraseña?</a>
      <p id="recuperar-acceso" hidden={!recovery} role="status" className="text-center text-sm text-muted-foreground">La recuperación de contraseña aún no está disponible.</p>
    </form>
  </section>;
}
