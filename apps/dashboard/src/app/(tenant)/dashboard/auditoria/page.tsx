import { Suspense } from "react";
import { AuditScreen } from "./components/audit-screen";

function ScreenFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-xl border bg-card" />
      <div className="h-96 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}

export default function AuditoriaPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <AuditScreen />
    </Suspense>
  );
}
