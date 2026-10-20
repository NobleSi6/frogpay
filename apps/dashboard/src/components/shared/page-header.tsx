import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

type PageHeaderProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, icon: Icon, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-100 via-primary-50 to-secondary-100 text-primary-700 shadow-sm ring-1 ring-primary-200/70 dark:from-primary-900/50 dark:via-primary-950/40 dark:to-secondary-900/30 dark:text-primary-200 dark:ring-primary-800/60">
            <Icon aria-hidden className="size-5" />
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
