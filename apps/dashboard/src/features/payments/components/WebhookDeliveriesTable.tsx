import { Badge } from '@/components/ui/badge';

export interface WebhookDelivery {
  id: string;
  event: string;
  status: 'Entregado' | 'Reintentando' | 'Fallido';
  httpCode: number;
  date: string;
}

export function WebhookDeliveriesTable({ deliveries }: { deliveries: WebhookDelivery[] }) {
  const mockDeliveries: WebhookDelivery[] = deliveries.length > 0 ? deliveries : [
    {
      id: 'del_1',
      event: 'pago.creado',
      status: 'Entregado',
      httpCode: 200,
      date: '10/10/2026 21:34:34',
    },
  ];

  return (
    <div className="space-y-3 mt-6">
      <h3 className="font-semibold text-slate-900 text-sm">Entregas Webhooks</h3>
      
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="grid grid-cols-4 bg-slate-50 p-3 text-xs font-semibold text-slate-500 border-b border-slate-200">
          <div>Evento</div>
          <div className="text-center">Estado</div>
          <div className="text-center">Código HTTP</div>
          <div className="text-right">Fecha</div>
        </div>

        <div className="divide-y divide-slate-100">
          {mockDeliveries.map((delivery) => (
            <div key={delivery.id} className="grid grid-cols-4 p-3 text-xs items-center">
              <div className="font-mono text-slate-700">{delivery.event}</div>
              <div className="text-center">
                <Badge
                  variant="outline"
                  className={
                    delivery.status === 'Entregado'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }
                >
                  {delivery.status}
                </Badge>
              </div>
              <div className="text-center font-mono font-medium text-slate-800">
                {delivery.httpCode}
              </div>
              <div className="text-right text-slate-500">{delivery.date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}