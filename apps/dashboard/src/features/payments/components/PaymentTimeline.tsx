import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface TimelineEvent {
  status: string;
  timestamp: string;
  isCurrent?: boolean;
}

export function PaymentTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Historial de estados</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
          {events.map((event, idx) => (
            <div key={idx} className="relative">
              <span
                className={`absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full ${
                  event.isCurrent
                    ? 'bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950'
                    : 'bg-muted-foreground/40'
                }`}
              />
              <p
                className={`text-sm font-medium ${
                  event.isCurrent ? 'text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                {event.status}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{event.timestamp}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}