"use client"

import { MessageSquareQuote, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Reveal } from "./Reveal"

const testimonials = [
  {
    quote:
      "FrogPay transformó completamente nuestra pasarela de pagos. Las disputas bajaron un 40% y las ventas globales aumentaron drásticamente.",
    author: "Sofía Martínez",
    role: "CTO, NovaFin",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
  },
  {
    quote:
      "No hay comisiones fantasmas. El soporte al cliente es súper rápido, literalmente saltamos de alegría desde que implementamos el sistema en nuestras sucursales.",
    author: "Alejandro Ruiz",
    role: "Fundador, SwiftSync",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
  },
  {
    quote:
      "La velocidad de liquidación es increíble. Lo que antes tardaba 3 días hábiles ahora se liquida en segundos sin contratiempos.",
    author: "Valeria Espinoza",
    role: "Dir. de Operaciones, Apex Corp",
    avatar:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop&crop=face",
  },
]

export const TestimonialsSection = () => {
  return (
    <section id="testimonios" className="relative bg-background py-24">
      <div className="mx-auto max-w-7xl px-6">
        <Reveal className="mb-16 text-center">
          <p className="mb-6 text-xs font-bold tracking-widest text-muted-foreground uppercase">
            Respaldado por líderes de la industria tecnológica
          </p>

          <Badge
            variant="outline"
            className="border-primary-300 text-accent-foreground"
          >
            Casos de éxito
          </Badge>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-balance text-foreground md:text-5xl">
            Lo que dicen quienes ya se{" "}
            <span className="text-primary">atrevieron a saltar</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((item, index) => (
            <Reveal key={item.author} delay={index * 100} className="h-full">
              <Card className="h-full justify-between shadow-sm transition-shadow hover:shadow-lg">
                <CardHeader>
                  <MessageSquareQuote size={24} className="text-primary/40" />
                </CardHeader>

                <CardContent>
                  <div className="flex gap-0.5 text-primary">
                    {Array.from({ length: 5 }).map((_, star) => (
                      <Star key={star} size={14} className="fill-current" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {item.quote}
                  </p>
                </CardContent>

                <CardFooter className="border-border">
                  <img
                    src={item.avatar}
                    alt={item.author}
                    className="size-10 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-sm font-bold text-foreground">
                      {item.author}
                    </div>
                    <div className="text-xs text-muted-foreground">{item.role}</div>
                  </div>
                </CardFooter>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
