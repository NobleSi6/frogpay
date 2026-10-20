import { Badge } from "@/components/ui/badge";
import { auditActionLabel } from "@/lib/api/audit-logs";
import { cn } from "cn";

const ACTION_STYLES: Record<string, string> = {
  "pago.creado": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "pago.aprobado": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "pago.rechazado": "bg-destructive/10 text-destructive",
  "pago.reembolsado": "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "webhook.creado": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "webhook.actualizado": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "webhook.eliminado": "bg-muted text-muted-foreground",
  "webhook.secret.rotado": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "api_key.creada": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "api_key.regenerada": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "api_key.revocada": "bg-muted text-muted-foreground",
  "credencial.proveedor.actualizada": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AuditActionBadge({ action }: { action: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-none px-2 py-0.5", ACTION_STYLES[action] ?? "bg-muted text-muted-foreground")}
    >
      {auditActionLabel(action)}
    </Badge>
  );
}
