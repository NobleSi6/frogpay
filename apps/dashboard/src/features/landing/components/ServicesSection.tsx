"use client"

import Link from "next/link"
import { ArrowRight, CreditCard, Repeat, ShieldCheck, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Reveal } from "./Reveal"

const services = [
  {
    icon: CreditCard,
    title: "Pagos con tarjeta",
    description:
      "Acepta débito y crédito locales e internacionales con tokenización y sin cargos ocultos.",
  },
  {
    icon: Wallet,
    title: "Billetera digital",
    description:
      "Saldos, transferencias y retiros en tiempo real desde una sola consola de administración.",
  },
  {
    icon: Repeat,
    title: "Suscripciones",
    description:
      "Cobros recurrentes automáticos con reintentos inteligentes y gestión de planes.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-fraude",
    description:
      "Reglas configurables y monitoreo en vivo para reducir el riesgo de fraude.",
  },
]

export const ServicesSection = () => {
  return (
    <section id="servicios" className="relative bg-muted/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge
            variant="outline"
            className="border-primary-300 text-accent-foreground"
          >
            Servicios
          </Badge>

          <h2 className="mt-6 text-3xl font-black tracking-tight text-balance text-foreground md:text-5xl">
            Todo lo que necesitas para{" "}
            <span className="text-primary">cobrar en cualquier lugar</span>
          </h2>

          <p className="mt-6 text-pretty text-muted-foreground">
            Una API única para tarjetas, billeteras y suscripciones, con liquidaciones
            rápidas y soporte local.
          </p>
        </Reveal>

        <Reveal
          delay={200}
          className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {services.map((service) => (
            <Card
              key={service.title}
              className="shadow-sm transition-shadow hover:shadow-lg"
            >
              <CardHeader>
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <service.icon size={20} />
                </div>
                <CardTitle>{service.title}</CardTitle>
                <CardDescription>{service.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Reveal>

        <Reveal delay={300} className="mt-12 text-center">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Explorar todos los servicios
            <ArrowRight data-icon="inline-end" />
          </Button>
        </Reveal>
      </div>
    </section>
  )
}
