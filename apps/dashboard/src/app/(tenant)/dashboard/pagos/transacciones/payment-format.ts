/** America/La_Paz es UTC-4 sin horario de verano. */
const LA_PAZ_OFFSET_MS = 4 * 60 * 60 * 1000;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

export function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formatea una cadena decimal para mostrarla (separador de miles y 2 decimales).
 * Nunca convierte a number: opera sobre la cadena para no perder precisión.
 */
export function formatDecimalAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return "—";
  const raw = value.trim();
  if (!DECIMAL_PATTERN.test(raw)) return raw;

  const negative = raw.startsWith("-");
  const [whole = "0", fraction = ""] = raw.replace("-", "").split(".");
  const paddedFraction = (fraction + "00").slice(0, 2);
  return `${negative ? "-" : ""}${groupThousands(whole.replace(/^0+(?=\d)/, ""))},${paddedFraction}`;
}

export function formatMoney(value: string | null | undefined, currency?: string): string {
  const amount = formatDecimalAmount(value);
  if (!currency || amount === "—") return amount;
  return `${amount} ${currency}`;
}

/** Fecha ISO-8601 UTC → dd/mm/aaaa hh:mm en America/La_Paz. */
export function formatLaPazDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return "—";
  const local = new Date(timestamp - LA_PAZ_OFFSET_MS);
  const day = String(local.getUTCDate()).padStart(2, "0");
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const hours = String(local.getUTCHours()).padStart(2, "0");
  const minutes = String(local.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${local.getUTCFullYear()} ${hours}:${minutes}`;
}

export function shortPaymentId(id: string): string {
  return id.slice(0, 8);
}
