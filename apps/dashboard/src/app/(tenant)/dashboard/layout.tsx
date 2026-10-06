import { TenantShell } from "@/components/layout/tenant-shell";
import { AuthGuard } from "@/features/auth/components/auth-guard";
import { TenantEnvironmentProvider } from "@/features/provider-credentials/environment-context";

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard role="OWNER"><TenantEnvironmentProvider><TenantShell>{children}</TenantShell></TenantEnvironmentProvider></AuthGuard>;
}
