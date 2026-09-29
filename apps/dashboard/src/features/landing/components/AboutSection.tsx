"use client"

import { Building2, Globe, ShoppingBag, User, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Reveal } from "./Reveal"

const metrics = [
  { value: "+5M", label: "Usuarios activos" },
  { value: "+50", label: "Países conectados" },
  { value: "99.99%", label: "Uptime garantizado" },
]

export const AboutSection = () => {
  return (
    <section id="quienes-somos" className="relative bg-background py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge
              variant="outline"
              className="border-primary-300 text-accent-foreground"
            >
              Quiénes somos
            </Badge>

            <h2 className="mt-6 text-3xl font-black tracking-tight text-balance text-foreground md:text-5xl">
              Dando un gran salto hacia la{" "}
              <span className="text-primary">inclusión financiera</span> en
              Latinoamérica.
            </h2>

            <p className="mt-6 leading-relaxed text-muted-foreground">
              En FrogPay creemos que enviar, recibir y administrar tu dinero no debería
              ser un laberinto burocrático. Nacimos con la misión de democratizar las
              herramientas de pago digitales de alto nivel para PyMEs, emprendedores y
              particulares de toda la región.
            </p>

            <p className="mt-4 leading-relaxed text-muted-foreground">
              Usando infraestructura de última generación, eliminamos intermediarios
              inútiles para ofrecer transferencias instantáneas seguras a un costo
              prácticamente nulo.
            </p>
          </div>

          <div className="relative flex items-center justify-center py-10">
            <div className="relative size-72 md:size-80">
              <svg
                aria-hidden
                className="absolute inset-0 size-full stroke-border"
                strokeWidth="1.5"
              >
                <line x1="160" y1="160" x2="80" y2="80" />
                <line x1="160" y1="160" x2="240" y2="90" />
                <line x1="160" y1="160" x2="90" y2="230" />
                <line
                  x1="160"
                  y1="160"
                  x2="230"
                  y2="240"
                  strokeDasharray="4 4"
                  className="stroke-primary"
                />
              </svg>

              <div className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-accent shadow-lg">
                <X size={24} className="text-primary" />
              </div>

              <div className="absolute top-8 left-8 flex size-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-50 shadow-md">
                <User size={20} />
              </div>

              <div className="absolute top-10 right-8 flex size-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-50 shadow-md">
                <ShoppingBag size={20} />
              </div>

              <div className="absolute bottom-8 left-10 flex size-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-50 shadow-md">
                <Globe size={20} />
              </div>

              <div className="absolute right-10 bottom-8 flex size-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-50 shadow-md">
                <Building2 size={20} />
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal
          delay={200}
          className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3"
        >
          {metrics.map((metric) => (
            <Card
              key={metric.label}
              className="border-primary-200 bg-accent/60 shadow-sm"
            >
              <CardContent className="pt-(--card-spacing) text-center">
                <div className="text-4xl font-black text-primary">
                  {metric.value}
                </div>
                <div className="mt-2 text-sm font-medium text-muted-foreground">
                  {metric.label}
                </div>
              </CardContent>
            </Card>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
