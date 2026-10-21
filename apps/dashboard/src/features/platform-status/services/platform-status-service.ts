import { apiRequest } from "@/lib/api-client";

export type PlatformHealthStatus = {
  status: "up" | "down";
  latencyMs?: number;
  provider?: string;
  type?: string;
};

export type PlatformCircuit = {
  name: string;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureRate: number;
  requestsInWindow: number;
  openedAt: string | null;
  nextAttemptAt: string | null;
};

export type PlatformStatus = {
  status: "ok" | "degraded";
  timestamp: string;
  services: {
    api?: PlatformHealthStatus;
    database: PlatformHealthStatus;
    eventBus: PlatformHealthStatus;
    redis: PlatformHealthStatus;
  };
  circuitBreakers: PlatformCircuit[];
  outbox: { pending: number | null };
  dlq?: { messages?: number; pending?: number };
};

export type AuditIntegrityResult = {
  tenantId: string;
  valid: boolean;
  recordsChecked: number;
  firstBrokenEventId: string | null;
  firstBrokenAt: string | null;
  verifiedAt: string;
};

export const getPlatformStatus = () =>
  apiRequest<PlatformStatus>("/admin/platform-status");

export const verifyAuditIntegrity = (tenantId: string) => {
  const query = new URLSearchParams({ tenantId });
  return apiRequest<AuditIntegrityResult>(`/admin/audit/verify?${query.toString()}`);
};
