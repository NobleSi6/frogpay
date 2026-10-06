'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePaymentDetail } from '@/features/payments/hooks/usePaymentDetail';
import { PaymentTimeline } from '@/features/payments/components/PaymentTimeline';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, CreditCard, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: payment, isLoading, isError } = usePaymentDetail(id);

  if (isLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        <p className="text-sm text-muted-foreground">Cargando detalles de la transacción...</p>
      </div>
    );
  }

  if (isError || !payment) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Link href="/dashboard/pagos">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Volver a pagos
          </Button>
        </Link>
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-destructive/20 bg-destructive/5 space-y-3">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <p className="font-semibold text-foreground">Error al cargar la transacción</p>
          <p className="text-sm text-muted-foreground">
            No se pudo encontrar la transacción con ID <span className="font-mono">{id}</span> o ocurrió un problema en el servidor.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Botón de retorno y encabezado */}
      <div className="space-y-2">
        <Link href="/dashboard/pagos">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver a pagos
          </Button>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Transacción #{payment.id}</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                payment.status === 'APPROVED'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : payment.status === 'REJECTED'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {payment.status === 'APPROVED' && <CheckCircle2 className="h-3.5 w-3.5" />}
              {payment.status === 'REJECTED' && <XCircle className="h-3.5 w-3.5" />}
              {payment.status === 'APPROVED'
                ? 'Aprobado'
                : payment.status === 'REJECTED'
                ? 'Rechazado'
                : 'Pendiente'}
            </span>
          </div>

          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
            {payment.environment}
          </span>
        </div>
      </div>

      {payment.status === 'REJECTED' && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive"
        >
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Pago rechazado</p>
            <p className="mt-1 text-sm">{payment.rejectionReason}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen del Pago */}
        <Card className="lg:col-span-2 shadow-sm border-border">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-base font-semibold">Resumen de la transacción</CardTitle>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Monto Solicitado</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {payment.amount.toFixed(2)} {payment.currency}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Comisión Aplicada</p>
              <p className="text-lg font-bold text-foreground mt-1">
                {payment.fee.toFixed(2)} {payment.currency}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Monto Neto</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {payment.net.toFixed(2)} {payment.currency}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Método de Pago</p>
              <div className="flex items-center gap-2 mt-1">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <p className="font-semibold text-foreground">Tarjeta {payment.paymentMethod}</p>
              </div>
            </div>

            <div className="sm:col-span-2 border-t pt-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Referencia del Comercio</p>
              <p className="text-base font-mono font-medium text-foreground mt-1">{payment.merchantReference}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ambiente</p>
              <p className="text-sm font-semibold text-foreground mt-1">{payment.environment}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Fecha de Creación</p>
              <p className="text-sm font-semibold text-foreground mt-1">{payment.createdAt}</p>
            </div>
          </CardContent>
        </Card>

        {/* Línea de Tiempo */}
        <div className="lg:col-span-1">
          <PaymentTimeline events={payment.timeline || []} />
        </div>
      </div>
    </div>
  );
}