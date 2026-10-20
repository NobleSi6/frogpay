"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardMetrics } from "@/lib/api/dashboard-metrics";
import {
  PAYMENT_METHOD_LABELS,
} from "../pagos/transacciones/payment-filters";
import type { PaymentMethod } from "@/lib/api/payments";
import { formatDecimalAmount, formatMoney } from "../pagos/transacciones/payment-format";

const APPROVED_COLOR = "#10b981";
const REJECTED_COLOR = "#ef4444";
const PENDING_COLOR = "#f59e0b";
const GRID_COLOR = "#d4d4d8";

function utcDayLabel(date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return date;
  const day = new Date(timestamp);
  return `${String(day.getUTCDate()).padStart(2, "0")}/${String(day.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isTodayUtc(date: string, now: Date): boolean {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(timestamp)) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return timestamp === today;
}

function xTickLabel(date: string, lastDate: string, now: Date): string {
  const label = utcDayLabel(date);
  if (date === lastDate && isTodayUtc(date, now)) return `${label} (hoy)`;
  return label;
}

type MetricsChartsProps = {
  metrics: DashboardMetrics;
  now?: Date;
};

export function MetricsCharts({ metrics, now = new Date() }: MetricsChartsProps) {
  const currency = metrics.currency;
  const lastDate = metrics.dailySeries.length > 0
    ? metrics.dailySeries[metrics.dailySeries.length - 1].date
    : "";

  const volumeData = metrics.dailySeries.map((point) => ({
    date: point.date,
    dayLabel: utcDayLabel(point.date),
    volumeValue: Number(point.volume),
    volume: point.volume,
  }));

  const methodData = metrics.byMethod.map((point) => ({
    label: PAYMENT_METHOD_LABELS[point.paymentMethod as PaymentMethod] ?? point.paymentMethod,
    transactionCount: point.transactionCount,
    approvedCount: point.approvedCount,
  }));

  const statusData = metrics.dailySeries.map((point) => ({
    date: point.date,
    dayLabel: utcDayLabel(point.date),
    aprobados: point.approvedCount,
    rechazados: point.rejectedCount + point.failedCount,
    pendientes: point.pendingCount,
  }));

  const axisTick = { fontSize: 11 } as const;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="shadow-sm xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Volumen diario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full" role="img" aria-label="Gráfico de línea del volumen diario">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volumeData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis
                  dataKey="dayLabel"
                  tick={axisTick}
                  tickFormatter={(_label: string, index: number) =>
                    xTickLabel(volumeData[index]?.date ?? lastDate, lastDate, now)
                  }
                />
                <YAxis
                  tick={axisTick}
                  width={80}
                  tickFormatter={(value: number) => formatDecimalAmount(String(value))}
                />
                <Tooltip
                  labelFormatter={(_label: unknown, payload: unknown) => {
                    const point = (payload as Array<{ payload?: { date?: string } }> | undefined)?.[0]?.payload;
                    return point?.date ? `Fecha (UTC): ${point.date}` : "";
                  }}
                  formatter={(value: unknown, _name: unknown, item: unknown) => {
                    const point = (item as { payload?: { volume?: string } } | undefined)?.payload;
                    return [formatMoney(point?.volume ?? String(value), currency), "Volumen"];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="volumeValue"
                  name="Volumen"
                  stroke={APPROVED_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Fechas en UTC · el último punto (hoy) está incompleto.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Transacciones por método
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="h-72 w-full"
            role="img"
            aria-label="Gráfico de barras de transacciones por método de pago"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={methodData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={axisTick} />
                <YAxis tick={axisTick} allowDecimals={false} width={40} />
                <Tooltip cursor={{ fill: "rgba(120,120,120,0.08)" }} />
                <Bar
                  dataKey="transactionCount"
                  name="Transacciones"
                  fill={APPROVED_COLOR}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Intentos creados por método en el período.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Resultados por día</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="h-72 w-full"
            role="img"
            aria-label="Gráfico de barras apiladas de aprobados, rechazados y pendientes por día"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis
                  dataKey="dayLabel"
                  tick={axisTick}
                  tickFormatter={(_label: string, index: number) =>
                    xTickLabel(statusData[index]?.date ?? lastDate, lastDate, now)
                  }
                />
                <YAxis tick={axisTick} allowDecimals={false} width={40} />
                <Tooltip
                  labelFormatter={(_label: unknown, payload: unknown) => {
                    const point = (payload as Array<{ payload?: { date?: string } }> | undefined)?.[0]?.payload;
                    return point?.date ? `Fecha (UTC): ${point.date}` : "";
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="aprobados" name="Aprobados" stackId="a" fill={APPROVED_COLOR} />
                <Bar
                  dataKey="rechazados"
                  name="Rechazados / fallidos"
                  stackId="a"
                  fill={REJECTED_COLOR}
                />
                <Bar
                  dataKey="pendientes"
                  name="Pendientes"
                  stackId="a"
                  fill={PENDING_COLOR}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Aprobados frente a rechazados (incluye fallidos) y pendientes por día UTC.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
