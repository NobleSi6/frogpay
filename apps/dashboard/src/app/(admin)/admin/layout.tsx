import { AdminShell } from "@/components/layout/admin-shell";
import { TenantProvider } from "@/features/tenants/components/tenant-provider";
import { AuthGuard } from "@/features/auth/components/auth-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard role="PLATFORM_ADMIN"><TenantProvider><AdminShell>{children}</AdminShell></TenantProvider></AuthGuard>;
}
