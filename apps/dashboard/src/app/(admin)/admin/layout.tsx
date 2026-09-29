export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* AdminShell/Sidebar van aquí cuando estén listos en components/layout */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
