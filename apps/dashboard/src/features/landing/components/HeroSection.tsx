"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Reveal } from "./Reveal"

export const HeroSection = () => {
  return (
    <section
      id="inicio"
      className="relative overflow-hidden bg-gradient-to-b from-primary-50 via-background to-background pt-36 pb-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary-500/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 -right-24 size-72 rounded-full bg-secondary-400/20 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Reveal immediate delay={100}>
            <h1 className="mt-6 text-4xl font-black tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              FrogPay: Pagos Agiles en un solo {" "}
              <span className="text-primary">salto.</span>
            </h1>
          </Reveal>

          <Reveal immediate delay={200}>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              FrogPay te conecta con tarjetas, transferencias y metodos locales en un
              solo lugar. Cobra en segundos, liquidamos mas rapido y eliminas los
              intermediarios.
            </p>
          </Reveal>

          <Reveal immediate delay={300}>
            <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/login" />}
                className="w-full sm:w-auto"
              >
                Inicia Sesion
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </Reveal>

          <Reveal immediate delay={400}>
            <p className="mt-6 text-xs text-muted-foreground">
              Con planes accesibles· Sin comisiones ocultas · Integracion rapida
            </p>
          </Reveal>
        </div>

        <Reveal immediate delay={300}>
            <div className="relative mx-auto w-full max-w-md lg:max-w-none h-[420px] sm:h-[480px] lg:h-[520px] overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-2xl">
                <Image
                src="/hero.jpg"
                alt="Panel de pagos de FrogPay"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-center transition-transform duration-500 hover:scale-105"
                />
            </div>
        </Reveal>
      </div>
    </section>
  )
}
