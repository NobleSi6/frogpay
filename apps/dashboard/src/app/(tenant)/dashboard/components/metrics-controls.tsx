"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  METRICS_DAY_OPTIONS,
  METRICS_ENVIRONMENT_OPTIONS,
  formatRelativeUpdate,
  type DashboardDays,
  type DashboardEnvironment,
} from "@/lib/api/dashboard-metrics";

const fieldClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

type MetricsControlsProps = {
  days: DashboardDays;
  environment: DashboardEnvironment;
  onDaysChange: (days: DashboardDays) => void;
  onEnvironmentChange: (environment: DashboardEnvironment) => void;
  onRefresh: () => void;
  generatedAt: string | null;
  isRefreshing: boolean;
};

export function MetricsControls({
  days,
  environment,
  onDaysChange,
  onEnvironmentChange,
  onRefresh,
  generatedAt,
  isRefreshing,
}: MetricsControlsProps) {
  return (
    <section
      aria-label="Controles de métricas"
      className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <label htmlFor="metrics-days" className="text-sm font-medium">
            Período
          </label>
          <select
            id="metrics-days"
            className={fieldClassName}
            value={days}
            onChange={(event) => onDaysChange(Number(event.target.value) as DashboardDays)}
          >
            {METRICS_DAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="metrics-environment" className="text-sm font-medium">
            Ambiente
          </label>
          <select
            id="metrics-environment"
            className={fieldClassName}
            value={environment}
            onChange={(event) =>
              onEnvironmentChange(event.target.value as DashboardEnvironment)
            }
          >
            {METRICS_ENVIRONMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Última actualización: {formatRelativeUpdate(generatedAt)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RotateCcw aria-hidden className="size-4" />
          Refrescar
        </Button>
      </div>
    </section>
  );
}
