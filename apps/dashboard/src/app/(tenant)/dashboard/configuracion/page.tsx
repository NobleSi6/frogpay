import Link from "next/link";
import { CreditCard, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfiguracionPage() {
  return <section className="space-y-6" aria-labelledby="settings-title">
    <header className="space-y-2">
      <h1 id="settings-title" className="text-h3 font-semibold">Configuración</h1>
      <p className="text-sm text-muted-foreground">Administra las integraciones y preferencias de tu tenant.</p>
    </header>
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard aria-hidden className="size-5 text-primary-700" />Proveedores de pago</CardTitle>
        <CardDescription>Configura las credenciales que FrogPay utilizará para procesar pagos.</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard/configuracion/proveedores" className="inline-flex min-h-11 items-center gap-2 rounded-lg font-medium text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          Administrar proveedores <ChevronRight aria-hidden className="size-4" />
        </Link>
      </CardContent>
    </Card>
  </section>;
}
