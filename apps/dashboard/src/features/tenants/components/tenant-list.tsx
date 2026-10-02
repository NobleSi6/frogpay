"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenants } from "./tenant-provider";
import { backendIntegrationEnabled } from "@/lib/api-client";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function TenantList() {
  const { tenants, error } = useTenants();
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-h3 font-semibold">Tenants</h1><p className="mt-1 text-sm text-muted-foreground">Gestiona las empresas invitadas a FrogPay.</p></div>
      <Button nativeButton={false} render={<Link href="/admin/tenants/nuevo" />} className="min-h-11 px-4"><Plus aria-hidden />Nuevo tenant</Button>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Card><CardContent>
      <Table className="min-w-180"><TableHeader><TableRow>{["Empresa", "Email owner", "Estado", "Fecha de creación", "Acciones"].map((title) => <TableHead key={title}>{title}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{tenants.map((tenant) => <TableRow key={tenant.id}>
          <TableCell className="max-w-64 whitespace-normal break-words font-medium">{tenant.company}</TableCell>
          <TableCell className="max-w-72 whitespace-normal break-all">{tenant.email}</TableCell>
          <TableCell><Badge variant="outline" className={tenant.status === "Activo" ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}>{tenant.status}</Badge></TableCell>
          <TableCell>{tenant.created}</TableCell>
          <TableCell><Button variant="ghost" disabled title="Disponible en un próximo sprint">Editar</Button></TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </CardContent></Card>
    {!backendIntegrationEnabled && <p className="text-xs text-muted-foreground">Vista de demostración. Los cambios se conservan durante la navegación y se reinician al recargar.</p>}
  </section>;
}
