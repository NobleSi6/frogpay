import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "cn";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative isolate flex flex-col items-center justify-center gap-5 overflow-hidden px-6 py-14 text-center sm:py-16",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_18%,var(--primary-100),transparent_34rem)] opacity-70 dark:bg-[radial-gradient(circle_at_50%_18%,var(--primary-900),transparent_30rem)] dark:opacity-40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-8 -z-10 h-40 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--neutral-300)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--neutral-300)_45%,transparent)_1px,transparent_1px)] bg-[size:24px_24px] opacity-35 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)]"
      />
      <div className="relative flex size-16 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-primary-300/60 animate-soft-ring"
        />
        <span
          aria-hidden
          className="absolute inset-1 rounded-full border border-secondary-300/40"
        />
        <span className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 via-white to-secondary-100 text-primary-700 shadow-[0_10px_30px_-12px_rgba(5,150,105,0.55)] ring-1 ring-primary-200/80 dark:from-primary-900/60 dark:via-neutral-900 dark:to-secondary-900/50 dark:text-primary-200 dark:ring-primary-800/70">
          {icon ?? <Inbox aria-hidden className="size-6" />}
        </span>
      </div>
      <div className="relative max-w-md space-y-1.5">
        <p className="text-base font-semibold tracking-tight text-foreground">{title}</p>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="relative">{action}</div>}
    </div>
  );
}
