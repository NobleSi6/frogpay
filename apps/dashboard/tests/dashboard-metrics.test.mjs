import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, { imports = {}, env = {}, globals = {} } = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Import sin preparar: ${name}`);
      return imports[name];
    },
    process: { env },
    URLSearchParams,
    ...globals,
  });
  return exports;
}

class FakeApiError extends Error {
  constructor(status, message, code, details, requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function makeApiRequest(calls) {
  return async (path, options = {}) => {
    calls.push({ path, options });
    return { ok: true };
  };
}

function loadMetrics({ calls = [] } = {}) {
  return load("lib/api/dashboard-metrics.ts", {
    imports: {
      "@tanstack/react-query": {
        keepPreviousData: Symbol("keepPreviousData"),
        useQuery: (config) => config,
      },
      "@/lib/api-client": {
        ApiError: FakeApiError,
        apiRequest: makeApiRequest(calls),
      },
    },
  });
}

function loadTenantPlan({ calls = [] } = {}) {
  return load("lib/api/tenant-plan.ts", {
    imports: {
      "@tanstack/react-query": { useQuery: (config) => config },
      "@/lib/api-client": {
        ApiError: FakeApiError,
        apiRequest: makeApiRequest(calls),
      },
    },
  });
}

function loadQueryError() {
  return load("lib/api/query-error.ts", {
    imports: { "@/lib/api-client": { ApiError: FakeApiError } },
  });
}

test("buildDashboardMetricsQueryString envía solo days y environment, nunca tenantId", () => {
  const { buildDashboardMetricsQueryString } = loadMetrics();
  const query = buildDashboardMetricsQueryString({ days: 7, environment: "sandbox" });
  assert.equal(query, "days=7&environment=sandbox");
  assert.ok(!query.includes("tenantId"));

  const production = buildDashboardMetricsQueryString({ days: 30, environment: "production" });
  assert.equal(production, "days=30&environment=production");
});

test("getDashboardMetrics consulta GET /dashboard/metrics con los parámetros del contrato", async () => {
  const calls = [];
  const { getDashboardMetrics } = loadMetrics({ calls });
  await getDashboardMetrics({ days: 30, environment: "production" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/dashboard/metrics?days=30&environment=production");
});

test("useDashboardMetrics usa queryKey estable, keepPreviousData y refresco cada 5 minutos", () => {
  const { useDashboardMetrics, METRICS_REFRESH_INTERVAL_MS } = loadMetrics();
  const params = { days: 7, environment: "sandbox" };
  const config = useDashboardMetrics(params);
  assert.equal(
    JSON.stringify(config.queryKey),
    JSON.stringify(["dashboard", "metrics", params]),
  );
  assert.equal(typeof config.placeholderData, "symbol");
  assert.equal(config.refetchInterval, 5 * 60 * 1000);
  assert.equal(METRICS_REFRESH_INTERVAL_MS, 300000);
});

test("formatApprovalRate muestra el porcentaje con un decimal en español", () => {
  const { formatApprovalRate } = loadMetrics();
  assert.equal(formatApprovalRate(0.9286), "92,9 %");
  assert.equal(formatApprovalRate(0), "0,0 %");
  assert.equal(formatApprovalRate(1), "100,0 %");
  assert.equal(formatApprovalRate(0.5), "50,0 %");
  assert.equal(formatApprovalRate(null), "—");
  assert.equal(formatApprovalRate(undefined), "—");
});

test("formatRelativeUpdate describe la última actualización en español", () => {
  const { formatRelativeUpdate } = loadMetrics();
  const now = new Date("2026-10-19T12:00:00.000Z");
  assert.equal(formatRelativeUpdate("2026-10-19T11:58:00.000Z", now), "hace 2 min");
  assert.equal(formatRelativeUpdate("2026-10-19T11:59:00.000Z", now), "hace 1 min");
  assert.equal(formatRelativeUpdate("2026-10-19T11:59:30.000Z", now), "hace unos segundos");
  assert.equal(formatRelativeUpdate("2026-10-19T10:00:00.000Z", now), "hace 2 h");
  assert.equal(formatRelativeUpdate("2026-10-17T12:00:00.000Z", now), "hace 2 d");
  assert.equal(formatRelativeUpdate("no-es-fecha", now), "—");
  assert.equal(formatRelativeUpdate(null, now), "—");
});

test("planUsagePercent calcula el consumo del límite mensual y respeta los planes sin límite", () => {
  const { planUsagePercent } = loadTenantPlan();
  const status = {
    plan: {
      id: "p1",
      name: "Emprendedor",
      monthlyPrice: "199.00",
      monthlyVolumeLimit: "1000.00",
      commissionFixed: "0.00",
      commissionPct: "3.5",
      features: null,
    },
    period: "2026-10",
    volumeUsed: "250.00",
    txCount: 4,
    remaining: "750.00",
    limitReached: false,
  };
  assert.equal(planUsagePercent(status), 25);

  const unlimited = { ...status, plan: { ...status.plan, monthlyVolumeLimit: null }, remaining: null };
  assert.equal(planUsagePercent(unlimited), null);

  const over = { ...status, volumeUsed: "2500.00", limitReached: true };
  assert.equal(planUsagePercent(over), 100);

  assert.equal(planUsagePercent(null), null);
});

test("describeQueryError mapea los errores del dashboard a mensajes en español", () => {
  const { describeQueryError, RATE_LIMIT_MESSAGE } = loadQueryError();

  const rateLimited = new FakeApiError(429, "Too many requests", "rate_limit_exceeded");
  assert.equal(describeQueryError(rateLimited, "fallback"), RATE_LIMIT_MESSAGE);
  assert.ok(RATE_LIMIT_MESSAGE.includes("rate_limit_exceeded"));
  assert.ok(/límite/i.test(RATE_LIMIT_MESSAGE));
  assert.ok(/intentarlo/i.test(RATE_LIMIT_MESSAGE));

  assert.match(
    describeQueryError(new FakeApiError(401, "unauthorized"), "fallback"),
    /sesión/i,
  );
  assert.match(
    describeQueryError(new FakeApiError(403, "forbidden"), "fallback"),
    /permiso/i,
  );
  assert.match(
    describeQueryError(new FakeApiError(400, "days inválido", "validation_error"), "fallback"),
    /Filtros inválidos/,
  );
  assert.equal(describeQueryError(new Error("algo"), "fallback"), "fallback");
  assert.equal(
    describeQueryError(new FakeApiError(0, "No se pudo contactar al servidor."), "fallback"),
    "No se pudo contactar al servidor.",
  );
});

test("isRateLimitError detecta 429 y el código rate_limit_exceeded", () => {
  const { isRateLimitError, isAuthError, isForbiddenError, isValidationError } = loadQueryError();
  assert.equal(isRateLimitError(new FakeApiError(429, "x")), true);
  assert.equal(isRateLimitError(new FakeApiError(400, "x", "rate_limit_exceeded")), true);
  assert.equal(isRateLimitError(new FakeApiError(500, "x")), false);
  assert.equal(isRateLimitError(new Error("x")), false);
  assert.equal(isAuthError(new FakeApiError(401, "x")), true);
  assert.equal(isForbiddenError(new FakeApiError(403, "x")), true);
  assert.equal(isValidationError(new FakeApiError(400, "x", "validation_error")), true);
});
