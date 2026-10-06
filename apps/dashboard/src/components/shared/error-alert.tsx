import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getFrogPayError } from "@/config/frogpay-errors";

type ErrorAlertProps = {
  code?: string | null;
  error?: unknown;
  message?: string;
  action?: string;
  title?: string;
};

function getApiFallback(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = error.status;
  if (status === 0) return {
    message: "No pudimos conectar con FrogPay.",
    action: "Revisa tu conexión e intenta nuevamente.",
  };
  if (status === 401) return {
    message: "Tu sesión venció o no es válida.",
    action: "Inicia sesión nuevamente para continuar.",
  };
  if (status === 403) return {
    message: "No tienes permisos para realizar esta acción.",
    action: "Solicita acceso al propietario de tu cuenta.",
  };
  return null;
}

function getApiErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

export function ErrorAlert({ code, error, message, action, title = "No pudimos completar la operación" }: ErrorAlertProps) {
  const apiFallback = getApiFallback(error);
  const mapped = apiFallback ?? getFrogPayError(code ?? getApiErrorCode(error));
  return <Alert variant="destructive">
    <CircleAlert aria-hidden />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      <p>{message ?? mapped.message}</p>
      <p className="mt-1 font-medium">{action ?? mapped.action}</p>
    </AlertDescription>
  </Alert>;
}
