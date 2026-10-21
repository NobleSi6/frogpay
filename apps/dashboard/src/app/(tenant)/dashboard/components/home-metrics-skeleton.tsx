export function HomeMetricsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Cargando métricas…</span>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-28 animate-pulse rounded-xl border bg-card shadow-sm"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl border bg-card shadow-sm" aria-hidden="true" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-80 animate-pulse rounded-xl border bg-card shadow-sm" aria-hidden="true" />
        <div className="h-80 animate-pulse rounded-xl border bg-card shadow-sm" aria-hidden="true" />
      </div>
    </div>
  );
}
