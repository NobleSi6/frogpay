import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getFrogPayError, type FrogPayErrorCode } from "@/config/frogpay-errors";

type ErrorAlertProps = {
  code?: FrogPayErrorCode;
  message?: string;
  action?: string;
  title?: string;
};

export function ErrorAlert({ code = "validation_error", message, action, title = "No pudimos completar la operación" }: ErrorAlertProps) {
  const mapped = getFrogPayError(code);
  return <Alert variant="destructive">
    <CircleAlert aria-hidden />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      <p>{message ?? mapped.message}</p>
      <p className="mt-1 font-medium">{action ?? mapped.action}</p>
    </AlertDescription>
  </Alert>;
}
