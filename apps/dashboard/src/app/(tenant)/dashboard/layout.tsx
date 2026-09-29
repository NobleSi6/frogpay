export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* TenantShell/Sidebar van aquí cuando estén listos en components/layout */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
