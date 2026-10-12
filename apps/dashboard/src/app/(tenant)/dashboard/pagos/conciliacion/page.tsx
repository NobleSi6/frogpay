import { BankReconciliationTable } from '@/features/payments/components/BankReconciliationTable';

export default function ReconciliationPage() {
  return (
    <section className="mx-auto max-w-6xl space-y-6" aria-labelledby="reconciliation-title">
      <header>
        <h1 id="reconciliation-title" className="text-2xl font-bold tracking-tight">
          Conciliación bancaria
        </h1>
        <p className="text-sm text-muted-foreground">
          Revisa y concilia los depósitos recibidos por transferencia.
        </p>
      </header>
      <BankReconciliationTable />
    </section>
  );
}
