import { TenantShell } from "@/components/layout/tenant-shell";
import { MockAuthGuard } from "@/features/auth/components/mock-auth-guard";

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  return <MockAuthGuard role="OWNER"><TenantShell>{children}</TenantShell></MockAuthGuard>;
}
