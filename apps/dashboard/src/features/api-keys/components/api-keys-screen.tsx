"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { backendIntegrationEnabled } from "@/lib/api-client";
import { useAuthSession } from "@/features/auth/auth-session";
import { generateApiKey, listApiKeys, regenerateApiKey, revokeApiKey, type ApiKey } from "../services/api-key-service";

const demoStorage = "frogpay.demo.api-key.public.v2";
function newDemoKey(): ApiKey {
  const id = crypto.randomUUID();
  return { id, tenantId: "demo", name: "Credenciales demo", type: "test", keyPrefix: `pk_demo_${id}`, maskedKey: `pk_demo_${id}`, isActive: true, createdAt: new Date().toISOString() };
}
function saveDemo(key: ApiKey) { try { sessionStorage.setItem(demoStorage, JSON.stringify(key)); } catch { /* Memory-only demo when storage is unavailable. */ } }

export function ApiKeysScreen() {
  const session = useAuthSession();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copying, setCopying] = useState(false);
  const [action, setAction] = useState<{ kind: "regenerate" | "revoke"; key: ApiKey } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const failed = useRef(false);
  const initialized = useRef(false);
  const tenantId = session?.user.tenant?.id;
  const realReady = backendIntegrationEnabled && Boolean(tenantId);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        if (realReady) {
          const result = await listApiKeys(tenantId!);
          if (active) setKeys(result);
        } else if (!initialized.current && active) {
          initialized.current = true;
          let saved: ApiKey | null = null;
          try { saved = JSON.parse(sessionStorage.getItem(demoStorage) ?? "null") as ApiKey | null; } catch { /* Start a fresh demo. */ }
          const key = saved?.keyPrefix?.startsWith("pk_demo_") ? saved : newDemoKey();
          saveDemo(key);
          setKeys([key]);
          if (!saved) setSecret({ id: key.id, value: `sk_demo_${crypto.randomUUID()}` });
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las API Keys."); }
      finally { if (active) setLoading(false); }
    }
    void initialize();
    return () => { active = false; };
  }, [realReady, tenantId]);

  async function copy(value: string) {
    setCopying(true); setMessage(""); setError("");
    try {
      if (!realReady && new URLSearchParams(location.search).get("simularError") === "copia") throw new Error("demo");
      await navigator.clipboard.writeText(value); setMessage("Copiado al portapapeles.");
    } catch { setError("No se pudo copiar. Selecciona el valor y cópialo manualmente."); }
    finally { setCopying(false); }
  }
  async function generate() {
    setLoading(true); setError(""); setMessage("");
    try {
      const result = await generateApiKey(tenantId!);
      const { rawKey, ...safeKey } = result;
      setKeys(current => [...current, safeKey]);
      setSecret({ id: safeKey.id, value: rawKey });
      setMessage("Credencial generada correctamente.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo generar la credencial."); }
    finally { setLoading(false); }
  }
  function ask(kind: "regenerate" | "revoke", key: ApiKey) { setAction({ kind, key }); setError(""); setMessage(""); dialog.current?.showModal(); }
  async function confirm() {
    if (!action || loading) return;
    setLoading(true); setError("");
    try {
      if (action.kind === "regenerate") {
        if (realReady) {
          const result = await regenerateApiKey(tenantId!, action.key.id);
          const { rawKey, ...replacement } = result;
          setKeys(current => current.map(key => key.id === action.key.id ? { ...key, isActive: false } : key).concat(replacement));
          setSecret({ id: replacement.id, value: rawKey });
          setMessage("Credenciales regeneradas correctamente.");
        } else {
          await new Promise(resolve => setTimeout(resolve, 1200));
          if (!failed.current && new URLSearchParams(location.search).get("simularError") === "regeneracion") { failed.current = true; throw new Error("No se pudieron regenerar las credenciales. Las actuales siguen disponibles."); }
          const key = newDemoKey(); saveDemo(key); setKeys([key]); setSecret({ id: key.id, value: `sk_demo_${crypto.randomUUID()}` });
          setMessage("Credenciales demo regeneradas correctamente.");
        }
      } else {
        const revoked = realReady
          ? await revokeApiKey(tenantId!, action.key.id)
          : { ...action.key, isActive: false };
        if (!realReady) { await new Promise(resolve => setTimeout(resolve, 700)); saveDemo(revoked); }
        setKeys(current => current.map(key => key.id === revoked.id ? revoked : key));
        setSecret(null);
        setMessage("Credencial revocada correctamente.");
      }
      dialog.current?.close(); setAction(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la operación."); }
    finally { setLoading(false); }
  }
  function field(label: string, value: string, id: string) {
    return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><div className="flex gap-2"><Input id={id} readOnly value={value} className="h-11 min-w-0 font-mono text-sm" autoComplete="off" /><Button variant="outline" className="size-11" aria-label={`Copiar ${label}`} disabled={loading || copying} onClick={() => void copy(value)}><Copy aria-hidden /></Button></div></div>;
  }
  return <section className="space-y-6"><h1 className="text-h3 font-semibold">API Keys</h1>
    <p className="text-sm text-muted-foreground">{realReady ? "Credenciales reales de tu tenant. La API devuelve un identificador enmascarado y el secret únicamente al generar o regenerar." : "Credenciales ficticias para probar el flujo visual. No permiten acceder a la API."}</p>
    {error && !action && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {message && <Alert role="status"><AlertDescription>{message}</AlertDescription></Alert>}
    {loading && <p role="status" className="flex items-center gap-2"><LoaderCircle aria-hidden className="size-4 animate-spin" />Procesando credenciales…</p>}
    {realReady && <Button disabled={loading || !!secret} className="min-h-11" onClick={() => void generate()}>Generar API Key de prueba</Button>}
    {keys.map(key => <Card key={key.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{key.name}</h2><Badge variant="outline">{key.isActive ? "Activa" : "Revocada"} · {key.type}</Badge></div></CardHeader><CardContent className="space-y-5">
      {field(realReady ? "API Key (enmascarada)" : "API Key", key.maskedKey, `key-${key.id}`)}
      {secret?.id === key.id && <><Alert className="border-warning/40"><AlertDescription>Guarda este secret ahora. No podrás volver a verlo.</AlertDescription></Alert>{field("Secret", secret.value, `secret-${key.id}`)}<Button className="min-h-11 whitespace-normal" disabled={loading || copying} onClick={() => { setSecret(null); setMessage("Secret oculto. No se almacena en el navegador ni se vuelve a consultar."); }}>He guardado mi secret</Button></>}
      {!secret && key.isActive && <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={loading} onClick={() => ask("regenerate", key)}>Regenerar credenciales</Button><Button variant="destructive" className="min-h-11" disabled={loading} onClick={() => ask("revoke", key)}>Revocar credencial</Button></div>}
      {!secret && !key.isActive && !realReady && <Button variant="outline" className="min-h-11" disabled={loading} onClick={() => ask("regenerate", key)}>Generar nuevas credenciales</Button>}
    </CardContent></Card>)}
    {!loading && realReady && keys.length === 0 && !error && <p>No tienes API Keys. Genera una para ver su secret una sola vez.</p>}
    <dialog ref={dialog} aria-labelledby="credentials-confirm-title" onCancel={event => { if (loading) event.preventDefault(); else setAction(null); }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg space-y-5 overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-xl backdrop:bg-neutral-900/60">
      <h2 id="credentials-confirm-title" className="text-xl font-semibold">{action?.kind === "revoke" ? "¿Revocar credencial?" : "¿Regenerar credenciales?"}</h2><p className="text-sm text-muted-foreground">La credencial actual dejará de funcionar. Deberás actualizar las integraciones que la utilicen.</p>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" className="min-h-11" disabled={loading} onClick={() => { dialog.current?.close(); setAction(null); setError(""); }}>Cancelar</Button><Button variant="destructive" className="min-h-11" disabled={loading} onClick={() => void confirm()}>{loading ? "Procesando…" : "Confirmar"}</Button></div>
    </dialog>
  </section>;
}
