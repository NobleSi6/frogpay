import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  FlaskConical,
  Info,
  Landmark,
  Lock,
  QrCode,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

const methods = [
  {
    href: "/dashboard/pagos/nuevo",
    label: "Pago con tarjeta",
    description: "Prueba el flujo completo con una tarjeta de test de Stripe.",
    icon: CreditCard,
    accent:
      "from-primary-100 to-primary-50 text-primary-700 ring-primary-200/70 dark:from-primary-900/50 dark:to-primary-950/30 dark:text-primary-200 dark:ring-primary-800/60",
    action: "Pagar con tarjeta",
  },
  {
    href: "/dashboard/pagos/transferencia",
    label: "Transferencia bancaria",
    description: "Genera instrucciones de depósito y concilia el pago.",
    icon: Landmark,
    accent:
      "from-secondary-100 to-secondary-50 text-secondary-700 ring-secondary-200/70 dark:from-secondary-900/50 dark:to-secondary-950/30 dark:text-secondary-200 dark:ring-secondary-800/60",
    action: "Generar transferencia",
  },
  {
    href: "/dashboard/pagos/qr",
    label: "Pago con QR",
    description: "Crea un código QR de prueba y sigue su estado en vivo.",
    icon: QrCode,
    accent:
      "from-violet-100 to-violet-50 text-violet-700 ring-violet-200/70 dark:from-violet-900/50 dark:to-violet-950/30 dark:text-violet-200 dark:ring-violet-800/60",
    action: "Generar QR",
  },
];

export default function PagosPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        title="Pagos"
        description="Elige un método para probar tu integración en el ambiente Sandbox."
        icon={CreditCard}
        actions={
          <Button nativeButton={false} render={<Link href="/dashboard/pagos/transacciones" />} variant="outline" className="min-h-10">
            <ReceiptText aria-hidden />
            Ver transacciones
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/[0.07] p-4 text-warning">
        <FlaskConical aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Estás en modo Sandbox</p>
          <p className="text-warning/85">
            Los pagos de esta sección son simulados. No se cobrará dinero real.
          </p>
        </div>
        <Link
          href="/dashboard/configuracion/proveedores"
          className="hidden shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline sm:inline-flex"
        >
          Configurar proveedores
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {methods.map(({ href, label, description, icon: Icon, accent, action }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_42px_-32px_rgba(15,23,42,0.45)] ring-1 ring-foreground/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_54px_-30px_rgba(5,150,105,0.4)] focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-primary-200/20 blur-2xl transition-opacity duration-300 group-hover:opacity-100 dark:bg-primary-700/10"
            />
            <div className="relative space-y-3">
              <span className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${accent}`}>
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="space-y-1">
                <h2 className="font-semibold tracking-tight">{label}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </div>
            <span className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 dark:text-primary-300">
              {action}
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info aria-hidden className="size-4 text-primary-600" />
            Antes de empezar
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
          <p>Configura tus credenciales de proveedor en Configuración → Proveedores.</p>
          <p>Usa tarjetas de prueba de Stripe para simular pagos aprobados o rechazados.</p>
          <p>Los webhooks se envían a todos los endpoints suscritos al evento.</p>
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="size-3.5" />
        Solo para pruebas · Ambiente Sandbox
      </p>
    </section>
  );
}
