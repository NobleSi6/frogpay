import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, { env = {}, globals = {} } = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      throw new Error(`Import inesperado en el test: ${name}`);
    },
    process: { env },
    URLSearchParams,
    ...globals,
  });
  return exports;
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const FILTERS_PATH = "app/(tenant)/dashboard/pagos/transacciones/payment-filters.ts";
const FORMAT_PATH = "app/(tenant)/dashboard/pagos/transacciones/payment-format.ts";

const filters = () => load(FILTERS_PATH);
const format = () => load(FORMAT_PATH);

test("convierte los filtros de la interfaz en los parámetros del contrato", () => {
  const f = filters();
  const params = clone(
    f.filtersToApiParams({
      ...f.getDefaultTransactionFilters(),
      status: "approved",
      paymentMethod: "card",
      environment: "sandbox",
      from: "2026-10-10",
      to: "2026-10-16",
      search: "  ORD-2026-0007  ",
      page: 3,
      limit: 50,
      sortBy: "amount",
      sortOrder: "asc",
    }),
  );

  assert.deepEqual(params, {
    page: 3,
    limit: 50,
    sortBy: "amount",
    sortOrder: "asc",
    status: "approved",
    paymentMethod: "card",
    environment: "sandbox",
    from: "2026-10-10T04:00:00.000Z",
    to: "2026-10-17T04:00:00.000Z",
    search: "ORD-2026-0007",
  });
});

test("from se envía como inicio del día (inclusivo) y to como inicio del día siguiente (exclusivo)", () => {
  const f = filters();
  const params = f.filtersToApiParams({ ...f.getDefaultTransactionFilters(), from: "2026-10-16", to: "2026-10-16" });
  assert.equal(params.from, "2026-10-16T04:00:00.000Z");
  assert.equal(params.to, "2026-10-17T04:00:00.000Z");
  assert.match(params.from, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(params.to, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Date.parse(params.to) > Date.parse(params.from));
});

test("omite los filtros vacíos y conserva los valores por defecto", () => {
  const f = filters();
  const params = clone(f.filtersToApiParams(f.getDefaultTransactionFilters()));
  assert.deepEqual(params, { page: 1, limit: 25, sortBy: "createdAt", sortOrder: "desc" });
  assert.ok(!("status" in params));
  assert.ok(!("paymentMethod" in params));
  assert.ok(!("environment" in params));
  assert.ok(!("from" in params));
  assert.ok(!("to" in params));
  assert.ok(!("search" in params));
});

test("los atajos Hoy, 7 días y 30 días usan el día de America/La_Paz", () => {
  const f = filters();
  const noon = new Date(Date.UTC(2026, 9, 16, 12, 0, 0));
  assert.deepEqual(clone(f.getDateRangeShortcut("today", noon)), { from: "2026-10-16", to: "2026-10-16" });
  assert.deepEqual(clone(f.getDateRangeShortcut("last7", noon)), { from: "2026-10-10", to: "2026-10-16" });
  assert.deepEqual(clone(f.getDateRangeShortcut("last30", noon)), { from: "2026-09-17", to: "2026-10-16" });

  const lateNight = new Date(Date.UTC(2026, 9, 16, 2, 0, 0));
  assert.deepEqual(clone(f.getDateRangeShortcut("today", lateNight)), { from: "2026-10-15", to: "2026-10-15" });

  const range = f.getDateRangeShortcut("last7", noon);
  const params = f.filtersToApiParams({ ...f.getDefaultTransactionFilters(), ...range });
  assert.equal(params.from, "2026-10-10T04:00:00.000Z");
  assert.equal(params.to, "2026-10-17T04:00:00.000Z");
});

test("el estado completo se serializa a la URL y se restaura igual", () => {
  const f = filters();
  const state = {
    status: "refunded",
    paymentMethod: "qr",
    environment: "production",
    from: "2026-10-01",
    to: "2026-10-15",
    search: "ORD-2026",
    page: 4,
    limit: 10,
    sortBy: "status",
    sortOrder: "asc",
  };

  const search = f.serializeTransactionFilters(state);
  const restored = clone(f.parseTransactionFilters(new URLSearchParams(search)));
  assert.deepEqual(restored, state);

  assert.equal(f.serializeTransactionFilters(f.getDefaultTransactionFilters()), "");
  assert.deepEqual(
    clone(f.parseTransactionFilters(new URLSearchParams(""))),
    clone(f.getDefaultTransactionFilters()),
  );
});

test("descarta de la URL los valores inválidos y respeta los válidos", () => {
  const f = filters();
  const parsed = clone(
    f.parseTransactionFilters(
      new URLSearchParams(
        "status=hack&paymentMethod=pigeon&environment=staging&from=2026-13-45&to=nope&page=abc&limit=999&sortBy=hack&sortOrder=hack&search=ORD",
      ),
    ),
  );

  assert.equal(parsed.status, "");
  assert.equal(parsed.paymentMethod, "");
  assert.equal(parsed.environment, "");
  assert.equal(parsed.from, "");
  assert.equal(parsed.to, "");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.sortBy, "createdAt");
  assert.equal(parsed.sortOrder, "desc");
  assert.equal(parsed.search, "ORD");

  const valid = clone(f.parseTransactionFilters(new URLSearchParams("page=7&limit=50&status=expired&sortBy=amount&sortOrder=asc&from=2026-10-01&to=2026-10-31")));
  assert.equal(valid.page, 7);
  assert.equal(valid.limit, 50);
  assert.equal(valid.status, "expired");
  assert.equal(valid.sortBy, "amount");
  assert.equal(valid.sortOrder, "asc");
  assert.equal(valid.from, "2026-10-01");
  assert.equal(valid.to, "2026-10-31");
});

test("detecta filtros activos solo cuando hay criterios de búsqueda", () => {
  const f = filters();
  assert.equal(f.hasActiveTransactionFilters(f.getDefaultTransactionFilters()), false);
  assert.equal(f.hasActiveTransactionFilters({ ...f.getDefaultTransactionFilters(), search: "   " }), false);
  assert.equal(f.hasActiveTransactionFilters({ ...f.getDefaultTransactionFilters(), search: "ORD" }), true);
  assert.equal(f.hasActiveTransactionFilters({ ...f.getDefaultTransactionFilters(), status: "pending" }), true);
  assert.equal(f.hasActiveTransactionFilters({ ...f.getDefaultTransactionFilters(), page: 9, limit: 10 }), false);
});

test("ofrece solo los tamaños de página del contrato", () => {
  const f = filters();
  assert.deepEqual(clone(f.PAGE_SIZE_OPTIONS), [10, 25, 50]);
  assert.equal(f.DEFAULT_PAGE_SIZE, 25);
  assert.equal(f.STATUS_OPTIONS.length, 8);
  assert.deepEqual(
    clone(f.STATUS_OPTIONS).map((option) => option.label),
    ["Todos los estados", "Pendiente", "Aprobado", "Rechazado", "Fallido", "Expirado", "Reembolsado", "Reembolso parcial"],
  );
});

test("formatea montos sin convertirlos a number y fechas en America/La_Paz", () => {
  const fmt = format();

  assert.equal(fmt.formatDecimalAmount("1234567.89"), "1.234.567,89");
  assert.equal(fmt.formatDecimalAmount("1200"), "1.200,00");
  assert.equal(fmt.formatDecimalAmount("0.5"), "0,50");
  assert.equal(fmt.formatDecimalAmount("-1234.5"), "-1.234,50");
  assert.equal(fmt.formatDecimalAmount(null), "—");
  assert.equal(fmt.formatDecimalAmount(undefined), "—");
  assert.equal(fmt.formatDecimalAmount(""), "—");
  assert.equal(fmt.formatMoney("42.00", "BOB"), "42,00 BOB");
  assert.equal(fmt.formatMoney(null, "BOB"), "—");

  // Los decimales largos se formatean sin pasar por Number (que perdería precisión).
  assert.equal(fmt.formatDecimalAmount("12345678901234567890.99"), "12.345.678.901.234.567.890,99");

  assert.equal(fmt.formatLaPazDateTime("2026-01-15T04:00:00.000Z"), "15/01/2026 00:00");
  assert.equal(fmt.formatLaPazDateTime("2026-01-15T03:59:00.000Z"), "14/01/2026 23:59");
  assert.equal(fmt.formatLaPazDateTime("2026-01-15T23:00:00.000Z"), "15/01/2026 19:00");
  assert.equal(fmt.formatLaPazDateTime("2026-10-17T04:30:00.000Z"), "17/10/2026 00:30");
  assert.equal(fmt.formatLaPazDateTime(null), "—");

  assert.equal(fmt.shortPaymentId("8a2d8a64-d1ea-4f73-b9fe-64c507ed7391"), "8a2d8a64");
  assert.equal(fmt.groupThousands("123456789"), "123.456.789");
});
