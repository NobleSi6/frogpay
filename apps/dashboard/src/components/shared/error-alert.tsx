import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getFrogPayError, isFrogPayErrorCode } from "@/config/frogpay-errors";

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
  if (status === 400 || status === 422) return {
    message: "La solicitud contiene datos que necesitan corrección.",
    action: "Revisa la información e inténtalo nuevamente.",
  };
  if (status === 404) return {
    message: "No encontramos el recurso solicitado.",
    action: "Verifica el identificador o vuelve a la lista.",
  };
  if (status === 409) return {
    message: "La operación entra en conflicto con otra solicitud.",
    action: "Espera a que termine el procesamiento antes de reintentar.",
  };
  if (status === 429) return {
    message: "Se alcanzó el límite de solicitudes o del plan.",
    action: "Espera un momento o revisa el consumo de tu plan.",
  };
  return null;
}

function getApiErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

function getRequestId(error: unknown) {
  if (!error || typeof error !== "object" || !("requestId" in error)) return undefined;
  return typeof error.requestId === "string" ? error.requestId : undefined;
}

export function ErrorAlert({ code, error, message, action, title = "No pudimos completar la operación" }: ErrorAlertProps) {
  const apiFallback = getApiFallback(error);
  const errorCode = code ?? getApiErrorCode(error);
  const mapped = isFrogPayErrorCode(errorCode)
    ? getFrogPayError(errorCode)
    : apiFallback ?? getFrogPayError(errorCode);
  const requestId = getRequestId(error);
  const visibleMessage = message ?? mapped.message;
  const showMessage = visibleMessage.replace(/[.!]$/, "") !== title.replace(/[.!]$/, "");
  return <Alert variant="destructive">
    <CircleAlert aria-hidden />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      {showMessage && <p>{visibleMessage}</p>}
      <p className="mt-1 font-medium">{action ?? mapped.action}</p>
      {requestId && <p className="mt-2 text-xs">Referencia: {requestId}</p>}
    </AlertDescription>
  </Alert>;
}
