import Link from "next/link";
import { ChevronRight, CreditCard, Store } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";

export default function ProvidersPage() {
  return <section className="space-y-6" aria-labelledby="providers-title">
    <PageHeader
      title="Proveedores"
      description="Administra las conexiones con tus proveedores de pago."
      icon={Store}
    />
    <Link
      href="/dashboard/configuracion/proveedores/stripe"
      className="group block max-w-2xl rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Card className="transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary-200 group-hover:shadow-[0_18px_44px_-28px_rgba(5,150,105,0.4)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700 ring-1 ring-primary-200/70 dark:bg-primary-900/40 dark:text-primary-200">
              <CreditCard aria-hidden className="size-[18px]" />
            </span>
            Stripe
          </CardTitle>
          <CardDescription>Pagos con tarjeta en ambientes sandbox y producción.</CardDescription>
        </CardHeader>
        <CardContent>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 dark:text-primary-300">
            Configurar Stripe
            <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  </section>;
}
