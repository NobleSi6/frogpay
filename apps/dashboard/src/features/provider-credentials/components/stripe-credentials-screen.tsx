"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";
import { EnvironmentBadge } from "@/components/shared/environment-indicator";
import { ErrorAlert } from "@/components/shared/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenantEnvironment } from "../environment-context";
import {
  providerCredentialsClient,
  type PaymentEnvironment,
  type SavedStripeCredentials,
} from "../provider-credentials-client";
import { validateStripeCredentials, type StripeCredentialErrors } from "../stripe-credentials-validation";

type Status = "default" | "loading" | "success" | "error";

export function StripeCredentialsScreen() {
  const { environment, setEnvironment } = useTenantEnvironment();
  const productionDialog = useRef<HTMLDialogElement>(null);
  const [publishableKey, setPublishableKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [errors, setErrors] = useState<StripeCredentialErrors>({});
  const [status, setStatus] = useState<Status>("loading");
  const [saved, setSaved] = useState<Partial<Record<PaymentEnvironment, SavedStripeCredentials>>>({});
  const [requestError, setRequestError] = useState<unknown>(null);
  const loading = status === "loading";

  useEffect(() => {
    let active = true;
    providerCredentialsClient.getStripeCredentials(environment)
      .then((result) => {
        if (!active) return;
        setSaved((current) => ({ ...current, [environment]: result }));
        setRequestError(null);
        setStatus("default");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setRequestError(error);
        setStatus("error");
      });
    return () => { active = false; };
  }, [environment]);

  function selectEnvironment(next: PaymentEnvironment) {
    if (next === environment) return;
    if (next === "production") {
      productionDialog.current?.showModal();
      return;
    }
    setEnvironment("sandbox");
    resetForm();
  }

  function confirmProduction() {
    setEnvironment("production");
    resetForm();
    productionDialog.current?.close();
  }

  function resetForm() {
    setPublishableKey("");
    setSecretKey("");
    setErrors({});
    setRequestError(null);
    setStatus("loading");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateStripeCredentials(environment, publishableKey, secretKey);
    setErrors(validation);
    setRequestError(null);
    if (Object.keys(validation).length > 0) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    const submittedSecret = secretKey.trim();
    setSecretKey("");
    try {
      const result = await providerCredentialsClient.saveStripeCredentials({ environment, publishableKey: publishableKey.trim(), secretKey: submittedSecret });
      setSaved((current) => ({ ...current, [environment]: result }));
      setPublishableKey("");
      setStatus("success");
    } catch (error: unknown) {
      setSecretKey("");
      setRequestError(error);
      setStatus("error");
    }
  }

  const configured = saved[environment];
  return <section className="space-y-6" aria-labelledby="stripe-title">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Configuración / Proveedores</p>
        <h1 id="stripe-title" className="text-h3 font-semibold">Stripe</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Configura las credenciales que FrogPay utilizará en cada ambiente.</p>
      </div>
      <EnvironmentBadge environment={environment} />
    </header>

    <div className="flex w-fit rounded-lg border bg-card p-1" aria-label="Ambiente de Stripe">
      {(["sandbox", "production"] as const).map((value) => <Button key={value} type="button" variant={environment === value ? "default" : "ghost"} aria-pressed={environment === value} onClick={() => selectEnvironment(value)} className="min-h-10">
        {value === "sandbox" ? "Sandbox" : "Producción"}
      </Button>)}
    </div>

    {configured?.configured && <Card className="max-w-3xl border-primary-200 bg-primary-50/40">
      <CardHeader><CardTitle>Credenciales configuradas</CardTitle><CardDescription>La clave secreta permanece protegida y no puede volver a mostrarse.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div><p className="text-xs font-medium text-muted-foreground">Clave publicable</p><p className="mt-1 break-all font-mono text-sm">{configured.publishableKey}</p></div>
        <div><p className="text-xs font-medium text-muted-foreground">Clave secreta</p><p className="mt-1 font-mono text-sm" aria-label="Clave secreta enmascarada">{configured.secretKeyMasked}</p></div>
      </CardContent>
    </Card>}

    <Card className="max-w-3xl">
      <CardHeader><CardTitle>{configured?.configured ? "Actualizar credenciales" : "Configurar credenciales"}</CardTitle><CardDescription>Las claves se validan para el ambiente seleccionado antes de enviarse.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-5" aria-busy={loading}>
          <div className="space-y-2">
            <Label htmlFor="stripe-publishable-key">Clave publicable</Label>
            <Input id="stripe-publishable-key" name="publishableKey" autoComplete="off" disabled={loading} value={publishableKey} placeholder={environment === "sandbox" ? "pk_test_…" : "Clave publicable de producción"} aria-invalid={Boolean(errors.publishableKey)} aria-describedby={errors.publishableKey ? "stripe-public-error" : undefined} onChange={(event) => { setPublishableKey(event.target.value); setErrors((current) => ({ ...current, publishableKey: undefined })); setStatus("default"); }} />
            {errors.publishableKey && <p id="stripe-public-error" className="text-sm text-destructive">{errors.publishableKey}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="stripe-secret-key">Clave secreta</Label>
            <Input id="stripe-secret-key" name="secretKey" type="password" autoComplete="new-password" disabled={loading} value={secretKey} placeholder={environment === "sandbox" ? "sk_test_…" : "Clave secreta de producción"} aria-invalid={Boolean(errors.secretKey)} aria-describedby={errors.secretKey ? "stripe-secret-error" : "stripe-secret-help"} onChange={(event) => { setSecretKey(event.target.value); setErrors((current) => ({ ...current, secretKey: undefined })); setStatus("default"); }} />
            <p id="stripe-secret-help" className="text-xs text-muted-foreground">Por seguridad, FrogPay no volverá a mostrar esta clave después de guardarla.</p>
            {errors.secretKey && <p id="stripe-secret-error" className="text-sm text-destructive">{errors.secretKey}</p>}
          </div>
          {status === "error" && <ErrorAlert code={Object.keys(errors).length ? "validation_error" : undefined} error={requestError} />}
          {status === "success" && <Alert className="border-success/30 bg-success/10 text-success"><CheckCircle2 aria-hidden /><AlertTitle>Credenciales guardadas</AlertTitle><AlertDescription>La clave secreta fue descartada de la pantalla y solo se conserva su versión enmascarada.</AlertDescription></Alert>}
          <Button type="submit" disabled={loading || !publishableKey.trim() || !secretKey.trim()} className="min-h-11 w-full sm:w-auto">
            {loading && <LoaderCircle aria-hidden className="animate-spin" />}{loading ? "Guardando…" : "Guardar credenciales"}
          </Button>
        </form>
      </CardContent>
    </Card>

    <dialog ref={productionDialog} aria-labelledby="production-confirmation-title" className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg space-y-5 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-neutral-900/60">
      <div className="flex size-11 items-center justify-center rounded-full bg-warning/15 text-warning"><ShieldAlert aria-hidden className="size-5" /></div>
      <div className="space-y-2"><h2 id="production-confirmation-title" className="text-xl font-semibold">Cambiar a Producción</h2><p className="text-sm text-muted-foreground">Los pagos en producción son reales. Confirma que utilizarás credenciales activas y que comprendes su impacto.</p></div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => productionDialog.current?.close()}>Cancelar</Button><Button type="button" onClick={confirmProduction}>Continuar a Producción</Button></div>
    </dialog>
  </section>;
}
