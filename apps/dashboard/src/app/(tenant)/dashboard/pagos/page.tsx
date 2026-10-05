'use client';

import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Landmark, Smartphone, AlertTriangle, Lock } from 'lucide-react';

export default function PagosPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header de la sección */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
        <p className="text-sm text-muted-foreground">
          Prueba tu integración en <span className="font-medium text-foreground">Acme Pagos</span>
        </p>
      </div>

      {/* Contenedor Principal */}
      <Card className="shadow-lg border-border">
        <CardHeader>
          <CardTitle className="text-xl">Elige un método de pago</CardTitle>
          <CardDescription>
            Selecciona cómo quieres realizar tu nuevo pago de prueba en Acme Pagos.
          </CardDescription>
          <CardAction>
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              Modo Sandbox
            </span>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Banner Advertencia Sandbox */}
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold">Los pagos no son reales</p>
              <p className="text-amber-700 dark:text-amber-300">
                Estás en un ambiente Sandbox. Esta página es solo para pruebas.
              </p>
            </div>
          </div>

          {/* Opciones de Métodos de Pago */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Opción 1: Tarjeta (Habilitada / Activa) */}
            <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/5 p-5 flex flex-col justify-between transition-all shadow-sm hover:shadow-md">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-foreground">Pago con tarjeta</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Continúa al formulario de pago con una tarjeta de prueba.
                  </p>
                </div>
              </div>
              <Link href="/dashboard/pagos/nuevo" className="w-full mt-6">
                <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium">
                  Tarjeta
                </Button>
              </Link>
            </div>

            {/* Opción 2: Transferencia Bancaria */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between opacity-80 hover:opacity-100 transition-all">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Landmark className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-foreground">Transferencia bancaria</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Elige una transferencia bancaria como método de pago.
                  </p>
                </div>
              </div>
              <Button variant="outline" disabled className="w-full mt-6">
                Transferencia
              </Button>
            </div>

            {/* Opción 3: Billetera Móvil */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between opacity-80 hover:opacity-100 transition-all">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-foreground">Billetera móvil</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Elige una billetera móvil como método de pago.
                  </p>
                </div>
              </div>
              <Button variant="outline" disabled className="w-full mt-6">
                Billetera móvil
              </Button>
            </div>

          </div>
        </CardContent>

        <CardFooter className="justify-center text-xs text-muted-foreground gap-1.5 border-t pt-4">
          <Lock className="h-3.5 w-3.5" />
          Solo para pruebas · Ambiente Sandbox
        </CardFooter>
      </Card>
    </div>
  );
}