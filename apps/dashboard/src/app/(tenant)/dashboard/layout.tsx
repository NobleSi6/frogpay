import { TenantShell } from "@/components/layout/tenant-shell";
import { AuthGuard } from "@/features/auth/components/auth-guard";

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard role="OWNER"><TenantShell>{children}</TenantShell></AuthGuard>;
}
