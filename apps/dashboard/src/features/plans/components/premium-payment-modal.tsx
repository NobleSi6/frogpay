"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PremiumPaymentModalProps = {
  priceLabel: string;
  isPending: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PremiumPaymentModal({
  priceLabel,
  isPending,
  error,
  onCancel,
  onConfirm,
}: PremiumPaymentModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (!isPending) heading.current?.focus();
  }, [isPending]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="premium-payment-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!isPending) onCancel();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-neutral-900/60 sm:p-7"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id="premium-payment-title" className="text-h4 font-semibold">
          Confirmar plan Premium
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Cerrar"
          disabled={isPending}
          onClick={onCancel}
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="space-y-4" aria-busy={isPending}>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              No se pudo activar el plan Premium. Revisa e intenta nuevamente.
            </AlertDescription>
          </Alert>
        ) : isPending ? (
          <>
            <p ref={heading} tabIndex={-1} className="text-sm font-medium outline-none">
              Procesando el pago simulado…
            </p>
            <p className="text-sm text-muted-foreground">
              Estamos registrando tu suscripción Premium. No se realiza ningún cobro real.
            </p>
            <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
            <p role="status" className="sr-only">
              Procesando el pago simulado del plan Premium…
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 aria-hidden className="size-10 text-primary" />
            <p ref={heading} tabIndex={-1} className="text-sm text-muted-foreground outline-none">
              Vas a contratar el plan{" "}
              <span className="font-medium text-foreground">Premium</span> por{" "}
              <span className="font-medium text-foreground">{priceLabel}</span> al mes.
            </p>
            <p className="text-sm text-muted-foreground">
              Este es un pago simulado: no se realiza ningún cobro real. Al confirmar, tu plan
              Premium quedará activo por 1 mes y se eliminará el límite mensual de volumen.
            </p>
          </>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending && <LoaderCircle aria-hidden className="animate-spin" />}
            {error ? "Reintentar" : isPending ? "Procesando…" : "Confirmar pago simulado"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
