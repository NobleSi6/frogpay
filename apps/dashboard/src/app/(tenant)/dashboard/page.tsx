import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TenantHomePage() {
  return <section className="space-y-6"><h1 className="text-h3 font-semibold">Inicio</h1><Card><CardContent className="flex min-h-80 flex-col items-center justify-center gap-4 text-center"><span className="rounded-full bg-accent p-5 text-accent-foreground"><CreditCard aria-hidden className="size-8" /></span><h2 className="text-h4 font-semibold">Aún no tienes pagos</h2><p className="max-w-md text-muted-foreground">Tus pagos aparecerán aquí cuando comiences a usar FrogPay.</p></CardContent></Card></section>;
}
