import { BankReconciliationTable } from "@/features/payments/components/BankReconciliationTable";

export default function ReconciliationPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pagos</h1>
        <p className="text-xs text-slate-500">
          Prueba tu integración en <span className="font-medium text-slate-700">Acme Pagos</span>
        </p>
      </div>

      <BankReconciliationTable />
    </div>
  );
}