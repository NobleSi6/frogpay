import type { ReactNode } from "react";
import { Percent, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatApprovalRate, type DashboardMetrics } from "@/lib/api/dashboard-metrics";
import { formatMoney } from "../pagos/transacciones/payment-format";

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  children,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Wallet;
  tone: "emerald" | "teal" | "blue" | "violet";
  children?: ReactNode;
}) {
  const tones = {
    emerald:
      "from-primary-100 to-primary-50 text-primary-700 ring-primary-200/70 dark:from-primary-900/50 dark:to-primary-950/30 dark:text-primary-200 dark:ring-primary-800/60",
    teal:
      "from-secondary-100 to-secondary-50 text-secondary-700 ring-secondary-200/70 dark:from-secondary-900/50 dark:to-secondary-950/30 dark:text-secondary-200 dark:ring-secondary-800/60",
    blue:
      "from-blue-100 to-blue-50 text-blue-700 ring-blue-200/70 dark:from-blue-900/40 dark:to-blue-950/20 dark:text-blue-200 dark:ring-blue-800/60",
    violet:
      "from-violet-100 to-violet-50 text-violet-700 ring-violet-200/70 dark:from-violet-900/40 dark:to-violet-950/20 dark:text-violet-200 dark:ring-violet-800/60",
  };

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-primary-200/20 blur-2xl dark:bg-primary-700/10"
      />
      <CardContent className="relative space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </p>
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${tones[tone]}`}
          >
            <Icon aria-hidden className="size-[18px]" />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {children}
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function MetricsKpiCards({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Volumen procesado"
        value={formatMoney(metrics.volume, metrics.currency)}
        hint="Pagos exitosos del período"
        icon={Wallet}
        tone="emerald"
      />
      <KpiCard
        label="Número de transacciones"
        value={metrics.transactionCount.toLocaleString("es-BO")}
        hint="Pagos creados en el período"
        icon={ReceiptText}
        tone="teal"
      />
      <KpiCard
        label="Tasa de aprobación"
        value={formatApprovalRate(metrics.approvalRate)}
        hint="Sobre resultados terminales"
        icon={TrendingUp}
        tone="blue"
      />
      <KpiCard
        label="Comisión y neto"
        value={formatMoney(metrics.netAmount, metrics.currency)}
        hint="Neto después de comisiones"
        icon={Percent}
        tone="violet"
      >
        <p className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
          <span className="text-[11px] text-muted-foreground">Comisión</span>
          <span className="text-xs font-semibold tabular-nums">
            {formatMoney(metrics.commissionAmount, metrics.currency)}
          </span>
        </p>
      </KpiCard>
    </div>
  );
}
