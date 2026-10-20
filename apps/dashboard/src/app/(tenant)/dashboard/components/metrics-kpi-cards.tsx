import { Card, CardContent } from "@/components/ui/card";
import { formatApprovalRate, type DashboardMetrics } from "@/lib/api/dashboard-metrics";
import { formatMoney } from "../pagos/transacciones/payment-format";

export function MetricsKpiCards({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="shadow-sm">
        <CardContent className="space-y-1 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Volumen procesado
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatMoney(metrics.volume, metrics.currency)}
          </p>
          <p className="text-xs text-muted-foreground">Pagos exitosos del período</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-1 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Número de transacciones
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {metrics.transactionCount.toLocaleString("es-BO")}
          </p>
          <p className="text-xs text-muted-foreground">Pagos creados en el período</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-1 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tasa de aprobación
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {formatApprovalRate(metrics.approvalRate)}
          </p>
          <p className="text-xs text-muted-foreground">Sobre resultados terminales</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="space-y-2 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Comisión y neto
          </p>
          <div className="space-y-1">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Comisión</span>
              <span className="text-base font-bold tabular-nums">
                {formatMoney(metrics.commissionAmount, metrics.currency)}
              </span>
            </p>
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">Neto</span>
              <span className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatMoney(metrics.netAmount, metrics.currency)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
