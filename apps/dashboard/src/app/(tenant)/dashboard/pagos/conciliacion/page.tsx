import { Scale } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { BankReconciliationTable } from '@/features/payments/components/BankReconciliationTable';

export default function ReconciliationPage() {
  return (
    <section className="space-y-6" aria-labelledby="reconciliation-title">
      <PageHeader
        title="Conciliación bancaria"
        description="Revisa y concilia los depósitos recibidos por transferencia."
        icon={Scale}
      />
      <BankReconciliationTable />
    </section>
  );
}
