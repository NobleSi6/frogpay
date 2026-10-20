import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LANDING_PLANS, type LandingPlan } from "../services/plan-catalog";
import { Reveal } from "./Reveal";

const featureLabels: Record<string, string> = {
  webhooks: "Webhooks",
  dashboard_basic: "Dashboard básico",
  analytics: "Analíticas avanzadas",
  fraud_detection: "Detección de fraude",
  multi_region: "Cobertura multi-región",
};

function formatBob(value: string): string {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function planBenefits(plan: LandingPlan): string[] {
  const benefits = Object.entries(featureLabels)
    .filter(([key]) => plan.features?.[key] === true)
    .map(([, label]) => label);
  const maxUsers = plan.features?.max_users;
  if (typeof maxUsers === "number") {
    benefits.push(maxUsers === 1 ? "1 usuario" : `Hasta ${maxUsers} usuarios`);
  }
  return benefits;
}

export const PlansSection = () => {
  const plans = LANDING_PLANS;

  return (
    <section id="planes" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="border-primary-300 text-accent-foreground">
            Planes
          </Badge>
          <h2 className="mt-6 text-3xl font-black tracking-tight text-balance text-foreground md:text-5xl">
            Planes claros, <span className="text-primary">sin sorpresas</span>
          </h2>
          <p className="mt-6 text-pretty text-muted-foreground">
            Empieza gratis y crece cuando lo necesites. Estos son los planes vigentes de FrogPay.
          </p>
        </Reveal>

        <Reveal
          delay={200}
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:mx-auto lg:max-w-4xl"
        >
          {plans.map((plan) => {
            const isFree = Number(plan.monthlyPrice) === 0;
            const highlighted = !isFree;
            return (
              <Card
                key={plan.id}
                className={highlighted ? "border-primary shadow-lg" : "shadow-sm"}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    {highlighted && <Badge className="bg-primary text-primary-foreground">Recomendado</Badge>}
                  </div>
                  <CardDescription>
                    {plan.monthlyVolumeLimit === null
                      ? "Sin límite mensual de volumen"
                      : `Hasta BOB ${formatBob(plan.monthlyVolumeLimit)} por mes`}
                  </CardDescription>
                  <p className="mt-2 text-4xl font-black tracking-tight">
                    {isFree ? "Gratis" : `BOB ${formatBob(plan.monthlyPrice)}`}
                    {!isFree && <span className="ml-1 text-sm font-medium text-muted-foreground">/mes</span>}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Comisión por pago:{" "}
                    <span className="font-medium text-foreground">
                      {(Number(plan.commissionPct) * 100).toLocaleString("es-BO", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      % + BOB {formatBob(plan.commissionFixed)}
                    </span>
                  </p>
                  <ul className="space-y-2 text-sm">
                    {planBenefits(plan).map((benefit) => (
                      <li key={benefit} className="flex items-center gap-2">
                        <Check aria-hidden className="size-4 text-primary" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    nativeButton={false}
                    render={<Link href="/login" />}
                    variant={highlighted ? "default" : "outline"}
                    className="w-full"
                  >
                    {isFree ? "Comenzar gratis" : "Elegir Premium"}
                    <ArrowRight data-icon="inline-end" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
};
