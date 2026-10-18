import { Suspense } from "react";
import { TransactionsScreen } from "./components/transactions-screen";

function ScreenFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <span className="block h-8 w-48 animate-pulse rounded-md bg-muted" />
        <span className="block h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="h-32 animate-pulse rounded-xl border bg-card" />
      <div className="h-72 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}

export default function TransaccionesPage() {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <TransactionsScreen />
    </Suspense>
  );
}
