"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFieldProps = Omit<ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  error?: string;
};

export function AuthField({ id, label, error, type, disabled, ...props }: AuthFieldProps) {
  const [visible, setVisible] = useState(false);
  const password = type === "password";

  return <div className="flex min-w-0 flex-col gap-2">
    <Label htmlFor={id} className="text-muted-foreground">{label}</Label>
    <div className="relative">
      <Input {...props} id={id} disabled={disabled} type={password && visible ? "text" : type}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        className={`h-12 text-base md:text-sm ${password ? "pr-12" : ""}`} />
      {password && <Button type="button" variant="ghost" size="icon" disabled={disabled}
        aria-label={`${visible ? "Ocultar" : "Mostrar"}: ${label.toLowerCase()}`}
        aria-controls={id} aria-pressed={visible} onClick={() => setVisible(value => !value)}
        className="absolute inset-y-0 right-0 h-12 w-11 text-muted-foreground">
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>}
    </div>
    {error && <p id={`${id}-error`} aria-live="polite" className="text-xs text-destructive">{error}</p>}
  </div>;
}
