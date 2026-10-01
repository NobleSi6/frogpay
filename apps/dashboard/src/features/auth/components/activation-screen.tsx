"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthBrand } from "./auth-brand";
import { AuthField } from "./auth-field";
import { ApiError, backendIntegrationEnabled } from "@/lib/api-client";
import { setSession } from "../auth-session";
import { activateInvitation } from "../services/activation-service";

type Status = "default" | "loading" | "success" | "invalid" | "disabled";
function initialStatus(token: string): Status {
  if (["expirado", "usado", "invalido"].includes(token)) return "invalid";
  return token === "restringido" ? "disabled" : "default";
}

export function ActivationScreen({ token, invitationEmail = "" }: { token: string; invitationEmail?: string }) {
  const fixtureMode = ["demo", "expirado", "usado", "invalido", "restringido"].includes(token);
  const useBackend = backendIntegrationEnabled && !fixtureMode;
  const [status, setStatus] = useState<Status>(() => useBackend ? "default" : initialStatus(token));
  const [email, setEmail] = useState(invitationEmail);
  const [serverError, setServerError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [touched, setTouched] = useState({ password: false, confirmation: false });
  const [help, setHelp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const valid = Boolean(password && confirmation && password === confirmation && (!useBackend || (password.length >= 12 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))));
  const confirmationError = !confirmation ? "Confirma tu contraseña." : confirmation !== password ? "Las contraseñas no coinciden." : undefined;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (status !== "default") heading.current?.focus(); }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ password: true, confirmation: true });
    if (!valid || status !== "default") return;
    setStatus("loading");
    setServerError("");
    if (useBackend) {
      try {
        await activateInvitation(email, token, password);
        setSession(null);
        setPassword(""); setConfirmation(""); setStatus("success");
      } catch (error) {
        if (error instanceof ApiError && error.status === 400 && /invitación.*(inválida|expir|utilizada)/i.test(error.message)) setStatus("invalid");
        else { setStatus("default"); setServerError(error instanceof Error ? error.message : "No se pudo activar la cuenta."); }
      }
      return;
    }
    // Tokens y activación simulados localmente; no crea cuentas ni guarda contraseñas.
    timer.current = setTimeout(() => {
      setSession(null);
      setPassword(""); setConfirmation(""); setStatus("success"); timer.current = null;
    }, 1200);
  }

  if (status !== "default") {
    const states = {
      loading: { title: "Validando invitación", description: "Estamos verificando el acceso y preparando tu cuenta para activarla.", icon: LoaderCircle },
      success: { title: "Cuenta activada", description: "Tu acceso fue habilitado correctamente. Ya puedes iniciar sesión con tu nueva contraseña.", icon: CircleCheck },
      invalid: { title: "Enlace inválido", description: "Este enlace de activación ha expirado o ya fue utilizado. Contacta al administrador de FrogPay para solicitar una nueva invitación.", icon: CircleAlert },
      disabled: { title: "Acceso restringido", description: "Solo el Tenant Owner puede activar esta cuenta. Si no eres el propietario, no podrás continuar.", icon: LockKeyhole },
    };
    const state = states[status];
    const Icon = state.icon;
    return <section aria-labelledby="activation-title" aria-busy={status === "loading"} className="flex min-w-0 flex-col gap-5">
      <span className={`flex size-14 items-center justify-center rounded-full ${status === "invalid" ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
        <Icon aria-hidden="true" className={`size-6 ${status === "loading" ? "motion-safe:animate-spin" : ""}`} />
      </span>
      <h1 id="activation-title" ref={heading} tabIndex={-1} className="text-xl font-semibold outline-none">{state.title}</h1>
      <p className="text-sm text-muted-foreground">{state.description}</p>
      {status === "loading" && <p role="status" className="text-sm text-muted-foreground">No cierres esta ventana</p>}
      {status === "success" && <Button nativeButton={false} render={<Link href="/login" />} className="min-h-12 w-full">Iniciar sesión</Button>}
      {(status === "invalid" || status === "disabled") && <>
        <Button type="button" onClick={() => setHelp(true)} className="min-h-12 w-full whitespace-normal">{status === "invalid" ? "Solicitar nueva invitación" : "Contactar a soporte"}</Button>
        {help && <Alert role="status"><AlertDescription>Contacta al administrador de FrogPay para recibir una nueva invitación. No se ha enviado ninguna solicitud desde esta pantalla.</AlertDescription></Alert>}
      </>}
    </section>;
  }

  return <section aria-labelledby="activation-title" className="flex min-w-0 flex-col gap-6">
    <AuthBrand />
    <header className="space-y-2">
      <h1 id="activation-title" className="text-3xl font-bold">Activa tu cuenta</h1>
      <p className="text-sm text-muted-foreground">Solo el Tenant Owner puede activar la cuenta desde esta invitación. Configura tu contraseña para acceder a FrogPay.</p>
    </header>
    <p className="flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-xs text-accent-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />Acceso exclusivo por invitación</p>
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {useBackend ? <AuthField id="activation-email" label="Email de la invitación" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /> : <p className="text-xs text-muted-foreground">Demostración local. No se activará una cuenta real.</p>}
      {useBackend && <p className="text-xs text-muted-foreground">La contraseña debe tener al menos 12 caracteres.</p>}
      {serverError && <Alert variant="destructive"><AlertDescription>{serverError}</AlertDescription></Alert>}
      <AuthField id="new-password" label="Nueva contraseña" name="new-password" type="password" autoComplete="new-password" required placeholder="••••••••••••"
        value={password} error={touched.password ? !password ? "La nueva contraseña es obligatoria." : useBackend && password.length < 12 ? "Usa al menos 12 caracteres." : undefined : undefined}
        onBlur={() => setTouched(value => ({ ...value, password: true }))} onChange={event => setPassword(event.target.value)} />
      <AuthField id="confirm-password" label="Confirmar contraseña" name="confirm-password" type="password" autoComplete="new-password" required placeholder="••••••••••••"
        value={confirmation} error={touched.confirmation ? confirmationError : undefined}
        onBlur={() => setTouched(value => ({ ...value, confirmation: true }))}
        onChange={event => { setConfirmation(event.target.value); setTouched(value => ({ ...value, confirmation: true })); }} />
      {valid && <p role="status" className="text-xs text-primary-700">Las contraseñas coinciden.</p>}
      <Button type="submit" disabled={!valid} className="min-h-12 w-full">Activar cuenta</Button>
      <p className="text-center text-xs text-muted-foreground">Solo el Tenant Owner puede completar esta invitación.</p>
    </form>
  </section>;
}
