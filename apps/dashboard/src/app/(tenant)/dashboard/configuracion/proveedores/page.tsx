import Link from "next/link";
import { ChevronRight, CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProvidersPage() {
  return <section className="space-y-6" aria-labelledby="providers-title">
    <header className="space-y-2"><p className="text-sm text-muted-foreground">Configuración</p><h1 id="providers-title" className="text-h3 font-semibold">Proveedores</h1><p className="text-sm text-muted-foreground">Administra las conexiones con tus proveedores de pago.</p></header>
    <Card className="max-w-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard aria-hidden className="size-5 text-primary-700" />Stripe</CardTitle><CardDescription>Pagos con tarjeta en ambientes sandbox y producción.</CardDescription></CardHeader>
      <CardContent><Link href="/dashboard/configuracion/proveedores/stripe" className="inline-flex min-h-11 items-center gap-2 rounded-lg font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Configurar Stripe <ChevronRight aria-hidden className="size-4" /></Link></CardContent>
    </Card>
  </section>;
}
