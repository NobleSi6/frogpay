import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";

export default function AdminHomePage() {
  return <Card><CardHeader><h1 className="text-h3 font-semibold">Panel de FrogPay</h1><CardDescription>Administra las empresas que utilizan FrogPay y sus invitaciones.</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<Link href="/admin/tenants" />} className="min-h-11 px-4">Ver tenants</Button></CardContent></Card>;
}
