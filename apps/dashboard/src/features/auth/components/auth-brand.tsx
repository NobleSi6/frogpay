import { CircleX } from "lucide-react";

export function AuthBrand() {
  return <div className="flex items-center gap-2.5 text-xl font-semibold">
    <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <CircleX className="size-5" aria-hidden="true" />
    </span>
    <span>FrogPay</span>
  </div>;
}
