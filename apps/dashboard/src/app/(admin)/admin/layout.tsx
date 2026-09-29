import { AdminShell } from "@/components/layout/admin-shell";
import { TenantProvider } from "@/features/tenants/components/tenant-provider";
import { MockAuthGuard } from "@/features/auth/components/mock-auth-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <MockAuthGuard role="PLATFORM_ADMIN"><TenantProvider><AdminShell>{children}</AdminShell></TenantProvider></MockAuthGuard>;
}
