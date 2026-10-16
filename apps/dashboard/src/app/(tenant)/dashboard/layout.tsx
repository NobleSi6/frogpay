import { TenantShell } from "@/components/layout/tenant-shell";
import { AuthGuard } from "@/features/auth/components/auth-guard";
import { TenantEnvironmentProvider } from "@/features/provider-credentials/environment-context";
import { PaymentsQueryProvider } from "@/features/payments/components/payments-query-provider";

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard role="OWNER"><PaymentsQueryProvider><TenantEnvironmentProvider><TenantShell>{children}</TenantShell></TenantEnvironmentProvider></PaymentsQueryProvider></AuthGuard>;
}
