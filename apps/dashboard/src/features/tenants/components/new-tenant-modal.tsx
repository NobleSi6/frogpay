"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTenants } from "./tenant-provider";
import { backendIntegrationEnabled } from "@/lib/api-client";

const fields = [
  { name: "company", label: "Nombre de empresa" },
  { name: "legalName", label: "Razón social" },
  { name: "taxId", label: "NIT / identificación fiscal" },
  { name: "address", label: "Dirección fiscal" },
  { name: "email", label: "Email owner" },
] as const;
type Field = (typeof fields)[number]["name"];
const emptyValues = { company: "", legalName: "", taxId: "", address: "", email: "" };

export function NewTenantModal() {
  const router = useRouter();
  const { tenants, addTenant } = useTenants();
  const dialog = useRef<HTMLDialogElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const [values, setValues] = useState(emptyValues);
  const [serverError, setServerError] = useState("");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<"default" | "loading" | "error" | "success">("default");
  const loading = status === "loading";
  function close() { router.push("/admin/tenants"); }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => { if (status === "success") successHeading.current?.focus(); }, [status]);

  function errorFor(name: Field) {
    if (!values[name].trim()) return "Este campo es obligatorio.";
    if (name === "company" && values.company.trim().length < 2) return "Introduce al menos 2 caracteres.";
    if (name === "taxId" && !/^[A-Za-z0-9-]{5,20}$/.test(values.taxId.trim())) return "El NIT debe tener entre 5 y 20 caracteres alfanuméricos o guiones.";
    if (name === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) return "Introduce un email válido.";
      if (tenants.some((tenant) => tenant.email.toLowerCase() === values.email.trim().toLowerCase())) return "Este email ya tiene un tenant asociado.";
    }
    return "";
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || status === "success") return;
    setTouched({ company: true, legalName: true, taxId: true, address: true, email: true });
    const invalid = fields.find(({ name }) => errorFor(name));
    if (invalid) { setStatus("error"); document.getElementById(`tenant-${invalid.name}`)?.focus(); return; }
    setStatus("loading");
    setServerError("");
    try { await addTenant(values); setStatus("success"); }
    catch (error) { setServerError(error instanceof Error ? error.message : "No se pudo crear el tenant."); setStatus("error"); }
  }

  return <dialog ref={dialog} aria-labelledby="new-tenant-title" onCancel={(event) => { event.preventDefault(); if (!loading) close(); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-neutral-900/60 sm:p-7">
    <div className="mb-5 flex items-start justify-between gap-3"><h2 id="new-tenant-title" className="text-h4 font-semibold">Nuevo tenant</h2><Button variant="ghost" size="icon" className="size-11" aria-label="Cerrar" disabled={loading} onClick={close}><X aria-hidden /></Button></div>
    {status === "success" ? <div className="space-y-5">
      <CheckCircle2 aria-hidden className="size-12 text-success" />
      <h3 ref={successHeading} tabIndex={-1} className="break-words text-xl font-semibold outline-none">Invitación enviada a {values.email.trim()}</h3>
      <p className="text-sm text-muted-foreground">{backendIntegrationEnabled ? "La API registró el tenant y encoló la invitación. La entrega del correo depende del servicio de notificaciones." : "Esta confirmación es una simulación local; no se envió un correo."}</p>
      <Button className="min-h-11 w-full" onClick={close}>Volver al listado de tenants</Button>
    </div> : <form noValidate onSubmit={submit} className="space-y-4" aria-busy={loading}>
      <p className="text-sm text-muted-foreground">Completa los datos de la empresa y de su owner. Todos los campos son obligatorios.</p>
      {backendIntegrationEnabled && <p className="text-xs text-muted-foreground">La API actual conserva razón social y dirección como metadatos; su integración con los campos fiscales está pendiente.</p>}
      {fields.map(({ name, label }) => {
        const error = touched[name] ? errorFor(name) : "";
        return <div key={name} className="space-y-2"><Label htmlFor={`tenant-${name}`}>{label}</Label>
          <Input id={`tenant-${name}`} name={name} type={name === "email" ? "email" : "text"} autoComplete={name === "email" ? "email" : name === "company" ? "organization" : "off"} required maxLength={name === "address" ? 250 : 150} value={values[name]} disabled={loading} aria-invalid={!!error} aria-describedby={error ? `tenant-${name}-error` : undefined} className="h-11 text-base md:text-sm" onBlur={() => setTouched((current) => ({ ...current, [name]: true }))} onChange={(event) => { setValues((current) => ({ ...current, [name]: event.target.value })); setStatus("default"); }} />
          {error && <p id={`tenant-${name}-error`} className="text-sm text-destructive">{error}</p>}
        </div>;
      })}
      {status === "error" && <Alert variant="destructive"><AlertDescription>{serverError || "Revisa los campos indicados antes de continuar."}</AlertDescription></Alert>}
      <p role="status" className="sr-only">{loading ? "Creando tenant y preparando invitación…" : ""}</p>
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={close} disabled={loading}>Cancelar</Button><Button type="submit" className="min-h-11" disabled={loading || fields.some(({ name }) => !values[name].trim())}>{loading && <LoaderCircle aria-hidden className="animate-spin" />}{loading ? "Enviando invitación…" : "Crear tenant"}</Button></div>
    </form>}
  </dialog>;
}
