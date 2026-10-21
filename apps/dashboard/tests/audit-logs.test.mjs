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
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const paymentFilters = load("app/(tenant)/dashboard/pagos/transacciones/payment-filters.ts");

function loadAuditLogs({ calls = [] } = {}) {
  return load("lib/api/audit-logs.ts", {
    imports: {
      "@tanstack/react-query": {
        keepPreviousData: Symbol("keepPreviousData"),
        useQuery: (config) => config,
      },
      "@/lib/api-client": {
        ApiError: FakeApiError,
        apiRequest: async (path, options = {}) => {
          calls.push({ path, options });
          return { data: [], page: 1, limit: 25, total: 0, totalPages: 0 };
        },
      },
    },
  });
}

function loadAuditFilters() {
  const auditLogs = loadAuditLogs();
  return load("app/(tenant)/dashboard/auditoria/audit-filters.ts", {
    imports: {
      "../pagos/transacciones/payment-filters": paymentFilters,
      "@/lib/api/audit-logs": auditLogs,
    },
  });
}

test("buildAuditLogQueryString incluye los filtros del contrato y omite los vacíos", () => {
  const { buildAuditLogQueryString } = loadAuditLogs();
  assert.equal(buildAuditLogQueryString({}), "");
  assert.equal(
    buildAuditLogQueryString({
      page: 2,
      limit: 50,
      paymentId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
      action: "pago.aprobado",
      from: "2026-10-16T04:00:00.000Z",
      to: "2026-10-17T04:00:00.000Z",
    }),
    "page=2&limit=50&paymentId=3f2504e0-4f89-11d3-9a0c-0305e82c3301&action=pago.aprobado&from=2026-10-16T04%3A00%3A00.000Z&to=2026-10-17T04%3A00%3A00.000Z",
  );
  assert.ok(!buildAuditLogQueryString({ page: 1 }).includes("tenantId"));
  assert.ok(!buildAuditLogQueryString({ page: 1 }).includes("environment"));
});

test("listAuditLogs consulta GET /dashboard/audit-logs y useAuditLogs usa queryKey estable", async () => {
  const calls = [];
  const { listAuditLogs, useAuditLogs } = loadAuditLogs({ calls });
  await listAuditLogs({ page: 1, limit: 25 });
  assert.equal(calls[0].path, "/dashboard/audit-logs?page=1&limit=25");

  const params = { page: 3, action: "pago.creado" };
  const config = useAuditLogs(params);
  assert.equal(JSON.stringify(config.queryKey), JSON.stringify(["audit-logs", "list", params]));
  assert.equal(typeof config.placeholderData, "symbol");
});

test("auditFiltersToApiParams convierte el día de La_Paz a UTC con to exclusivo", () => {
  const { auditFiltersToApiParams, getDefaultAuditFilters } = loadAuditFilters();
  const params = auditFiltersToApiParams({
    ...getDefaultAuditFilters(),
    from: "2026-10-16",
    to: "2026-10-16",
  });
  assert.equal(params.from, "2026-10-16T04:00:00.000Z");
  assert.equal(params.to, "2026-10-17T04:00:00.000Z");

  const ranged = auditFiltersToApiParams({
    ...getDefaultAuditFilters(),
    from: "2026-10-10",
    to: "2026-10-16",
  });
  assert.equal(ranged.from, "2026-10-10T04:00:00.000Z");
  assert.equal(ranged.to, "2026-10-17T04:00:00.000Z");
});

test("auditFiltersToApiParams valida el UUID del pago y nunca envía tenantId ni environment", () => {
  const { auditFiltersToApiParams, getDefaultAuditFilters } = loadAuditFilters();
  const invalid = auditFiltersToApiParams({
    ...getDefaultAuditFilters(),
    paymentId: "no-es-uuid",
  });
  assert.equal(invalid.paymentId, undefined);
  assert.ok(!("environment" in invalid));

  const valid = auditFiltersToApiParams({
    ...getDefaultAuditFilters(),
    paymentId: " 3f2504e0-4f89-11d3-9a0c-0305e82c3301 ",
  });
  assert.equal(valid.paymentId, "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
});

test("parse/serialize de filtros de auditoría hace round-trip por la URL", () => {
  const { parseAuditFilters, serializeAuditFilters, getDefaultAuditFilters } = loadAuditFilters();

  const defaults = parseAuditFilters(new URLSearchParams(""));
  assert.deepEqual({ ...defaults }, { ...getDefaultAuditFilters() });
  assert.equal(serializeAuditFilters(getDefaultAuditFilters()), "");

  const parsed = parseAuditFilters(
    new URLSearchParams(
      "paymentId=3f2504e0-4f89-11d3-9a0c-0305e82c3301&action=pago.creado&from=2026-10-10&to=2026-10-16&page=2&limit=50",
    ),
  );
  assert.equal(parsed.paymentId, "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  assert.equal(parsed.action, "pago.creado");
  assert.equal(parsed.from, "2026-10-10");
  assert.equal(parsed.to, "2026-10-16");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 50);
  assert.equal(
    serializeAuditFilters(parsed),
    "paymentId=3f2504e0-4f89-11d3-9a0c-0305e82c3301&action=pago.creado&from=2026-10-10&to=2026-10-16&page=2&limit=50",
  );

  const invalid = parseAuditFilters(new URLSearchParams("from=2026-99-99&to=basura&page=0&limit=7"));
  assert.equal(invalid.from, "");
  assert.equal(invalid.to, "");
  assert.equal(invalid.page, 1);
  assert.equal(invalid.limit, 25);
});

test("las opciones de acción cubren los valores reales del backend, con etiqueta en español", () => {
  const { AUDIT_ACTION_OPTIONS, AUDIT_ACTION_LABELS, auditActionLabel } = loadAuditLogs();
  const values = AUDIT_ACTION_OPTIONS.map((option) => option.value);
  for (const action of [
    "pago.creado",
    "pago.aprobado",
    "pago.rechazado",
    "pago.reembolsado",
    "webhook.creado",
    "webhook.actualizado",
    "webhook.eliminado",
    "webhook.secret.rotado",
    "api_key.creada",
    "api_key.regenerada",
    "api_key.revocada",
    "credencial.proveedor.actualizada",
  ]) {
    assert.ok(values.includes(action), `falta la acción ${action}`);
    assert.ok(AUDIT_ACTION_LABELS[action].length > 0);
    assert.notEqual(AUDIT_ACTION_LABELS[action], action);
  }
  assert.equal(AUDIT_ACTION_OPTIONS[0].value, "");
  assert.equal(auditActionLabel("pago.aprobado"), "Pago aprobado");
  assert.equal("webhook.creado" in AUDIT_ACTION_LABELS, true);
  assert.equal(auditActionLabel("accion.desconocida"), "accion.desconocida");
  assert.equal(auditActionLabel(null), "—");
});

test("formatAuditTransition muestra el cambio de estado o solo el nuevo", () => {
  const { formatAuditTransition, auditStateValue } = loadAuditLogs();
  assert.equal(
    formatAuditTransition({ status: "pending" }, { status: "approved" }),
    "Pendiente → Aprobado",
  );
  assert.equal(formatAuditTransition(null, { status: "approved" }), "Aprobado");
  assert.equal(formatAuditTransition(undefined, { status: "rejected" }), "Rechazado");
  assert.equal(formatAuditTransition(null, null), "—");
  assert.equal(formatAuditTransition({ status: "approved" }, { status: "partially_refunded" }), "Aprobado → Reembolso parcial");

  assert.equal(auditStateValue({ status: "approved" }), "approved");
  assert.equal(auditStateValue("expired"), "expired");
  assert.equal(auditStateValue(null), null);
  assert.equal(auditStateValue({}), null);
});

test("formatAuditActor no expone identificadores sensibles", () => {
  const { formatAuditActor } = loadAuditLogs();
  assert.equal(
    formatAuditActor({ type: "user", id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", role: "OWNER" }),
    "Usuario · OWNER",
  );
  assert.equal(formatAuditActor({ type: "user", id: "u-1" }), "Usuario");
  assert.equal(formatAuditActor({ type: "system", id: "payment-events" }), "Sistema · payment-events");
  assert.equal(
    formatAuditActor({ type: "system", id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" }),
    "Sistema",
  );
  assert.equal(formatAuditActor({ type: "api" }), "API");
  assert.equal(formatAuditActor(null), "—");
});

test("isValidUuid e isInvalidPaymentIdFilter gobiernan el aviso del filtro de pago", () => {
  const { isValidUuid } = loadAuditLogs();
  const { isInvalidPaymentIdFilter, hasActiveAuditFilters, getDefaultAuditFilters } = loadAuditFilters();

  assert.equal(isValidUuid("3f2504e0-4f89-11d3-9a0c-0305e82c3301"), true);
  assert.equal(isValidUuid("3f2504e04f8911d39a0c0305e82c3301"), false);
  assert.equal(isValidUuid("no-uuid"), false);
  assert.equal(isValidUuid(""), false);

  assert.equal(isInvalidPaymentIdFilter(getDefaultAuditFilters()), false);
  assert.equal(isInvalidPaymentIdFilter({ ...getDefaultAuditFilters(), paymentId: "abc" }), true);
  assert.equal(
    isInvalidPaymentIdFilter({ ...getDefaultAuditFilters(), paymentId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301" }),
    false,
  );

  assert.equal(hasActiveAuditFilters(getDefaultAuditFilters()), false);
  assert.equal(hasActiveAuditFilters({ ...getDefaultAuditFilters(), action: "pago.creado" }), true);
  assert.equal(hasActiveAuditFilters({ ...getDefaultAuditFilters(), from: "2026-10-10" }), true);
  assert.equal(hasActiveAuditFilters({ ...getDefaultAuditFilters(), paymentId: "x" }), true);
});
