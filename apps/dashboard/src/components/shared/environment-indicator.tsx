import { FlaskConical, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PaymentEnvironment } from "@/features/provider-credentials/provider-credentials-client";

export function EnvironmentBadge({ environment }: { environment: PaymentEnvironment }) {
  const sandbox = environment === "sandbox";
  return <Badge variant={sandbox ? "secondary" : "default"} className={sandbox ? "bg-warning/15 text-warning" : undefined}>
    {sandbox ? <FlaskConical aria-hidden data-icon="inline-start" /> : <ShieldCheck aria-hidden data-icon="inline-start" />}
    {sandbox ? "Sandbox" : "Producción"}
  </Badge>;
}

export function SandboxBanner({ environment }: { environment: PaymentEnvironment }) {
  if (environment !== "sandbox") return null;
  return <div role="status" className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm font-medium text-warning">
    <FlaskConical aria-hidden className="size-4 shrink-0" />
    Modo Sandbox: los pagos no son reales
  </div>;
}
