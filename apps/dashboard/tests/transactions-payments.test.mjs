import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

class FakeApiError extends Error {
  constructor(status, message, code, details, requestId) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function load(file, { imports = {}, env = {}, globals = {} } = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(`Import sin preparar en el test: ${name}`);
      return imports[name];
    },
    process: { env },
    setTimeout,
    clearTimeout,
    URLSearchParams,
    ...globals,
  });
  return { exports, source };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const mockImports = { "@/lib/api-client": { ApiError: FakeApiError } };

function loadMock(env = {}, globals = {}) {
  return load("lib/api/payments-mock.ts", { imports: mockImports, env, globals }).exports;
}

function loadPayments(env, spies) {
  const keepPreviousData = (value) => value;
  return load("lib/api/payments.ts", {
    imports: {
      "@/lib/api-client": { ApiError: FakeApiError, apiRequest: spies.apiRequest },
      "./payments-mock": { mockListPayments: spies.mockListPayments, MOCK_LATENCY_MS: 300 },
      "@tanstack/react-query": { useQuery: (config) => config, keepPreviousData },
    },
    env,
  }).exports;
}

const okResponse = { data: [], page: 1, limit: 25, total: 0, totalPages: 0 };

test("el simulador genera 120 pagos deterministas con referencias, estados y ambientes del contrato", () => {
  const mock = loadMock();
  const first = mock.generateMockPayments({ now: NOW });
  const second = mock.generateMockPayments({ now: NOW });

  assert.deepEqual(clone(first), clone(second));
  assert.equal(first.length, 120);
  assert.equal(first[0].merchantReference, "ORD-2026-0001");
  assert.equal(first[119].merchantReference, "ORD-2026-0120");
  assert.deepEqual([...new Set(first.map((payment) => payment.status))].sort(), [
    "approved",
    "expired",
    "failed",
    "partially_refunded",
    "pending",
    "refunded",
    "rejected",
  ]);
  assert.deepEqual([...new Set(first.map((payment) => payment.paymentMethod))].sort(), [
    "bank_transfer",
    "card",
    "qr",
  ]);
  assert.deepEqual([...new Set(first.map((payment) => payment.environment))].sort(), ["production", "sandbox"]);
  assert.deepEqual([...new Set(first.map((payment) => payment.currency))].sort(), ["BOB", "USD"]);

  for (const payment of first) {
    const createdAt = Date.parse(payment.createdAt);
    assert.ok(createdAt <= NOW);
    assert.ok(NOW - createdAt <= 30 * DAY_MS);
    assert.equal(typeof payment.amount, "string");
    assert.ok(payment.commissionAmount === null || typeof payment.commissionAmount === "string");
    assert.ok(payment.netAmount === null || typeof payment.netAmount === "string");
    assert.ok(/^ORD-2026-\d{4}$/.test(payment.merchantReference));
  }
});

test("el simulador filtra por estado, método y ambiente, y los combina", () => {
  const mock = loadMock();
  const payments = mock.generateMockPayments({ now: NOW });

  const approved = mock.filterMockPayments(payments, { status: "approved" });
  assert.ok(approved.length > 0);
  assert.ok(approved.every((payment) => payment.status === "approved"));

  const cards = mock.filterMockPayments(payments, { paymentMethod: "card" });
  assert.ok(cards.length > 0);
  assert.ok(cards.every((payment) => payment.paymentMethod === "card"));

  const production = mock.filterMockPayments(payments, { environment: "production" });
  assert.ok(production.length > 0);
  assert.ok(production.every((payment) => payment.environment === "production"));

  const combined = mock.filterMockPayments(payments, {
    status: "pending",
    paymentMethod: "qr",
    environment: "sandbox",
  });
  assert.ok(combined.length > 0);
  assert.ok(
    combined.every(
      (payment) =>
        payment.status === "pending" && payment.paymentMethod === "qr" && payment.environment === "sandbox",
    ),
  );
  assert.ok(combined.length < approved.length);
  assert.ok(combined.length < cards.length);
});

test("from es inclusivo y to es exclusivo sobre createdAt", async () => {
  const mock = loadMock();
  const payments = mock.generateMockPayments({ now: NOW });
  const newer = payments[4];
  const older = payments[5];

  const inclusive = mock.filterMockPayments(payments, { from: older.createdAt });
  assert.ok(inclusive.some((payment) => payment.id === older.id));

  const exclusive = mock.filterMockPayments(payments, { to: older.createdAt });
  assert.ok(!exclusive.some((payment) => payment.id === older.id));

  const range = mock.filterMockPayments(payments, { from: older.createdAt, to: newer.createdAt });
  assert.deepEqual(clone(range.map((payment) => payment.id)), [older.id]);

  const listed = await mock.mockListPayments(
    { from: older.createdAt, to: newer.createdAt },
    { latencyMs: 0, now: NOW },
  );
  assert.equal(listed.total, 1);
  assert.equal(listed.data[0].id, older.id);
});

test("el simulador pagina en el servidor, respeta limit por defecto y acota a 100", async () => {
  const mock = loadMock();
  // El dataset ya viene ordenado de forma descendente por createdAt.
  const dataset = mock.generateMockPayments({ now: NOW });

  const first = await mock.mockListPayments({}, { latencyMs: 0, now: NOW });
  assert.equal(first.page, 1);
  assert.equal(first.limit, 25);
  assert.equal(first.total, 120);
  assert.equal(first.totalPages, 5);
  assert.equal(first.data.length, 25);
  assert.equal(first.data[0].id, dataset[0].id);

  const second = await mock.mockListPayments({ page: 2 }, { latencyMs: 0, now: NOW });
  assert.equal(second.page, 2);
  assert.equal(second.data.length, 25);
  assert.equal(second.data[0].id, dataset[25].id);

  const ten = await mock.mockListPayments({ limit: 10 }, { latencyMs: 0, now: NOW });
  assert.equal(ten.limit, 10);
  assert.equal(ten.data.length, 10);
  assert.equal(ten.totalPages, 12);

  const max = await mock.mockListPayments({ limit: 500 }, { latencyMs: 0, now: NOW });
  assert.equal(max.limit, 100);
  assert.equal(max.data.length, 100);

  const invalid = await mock.mockListPayments({ limit: 0, page: 0 }, { latencyMs: 0, now: NOW });
  assert.equal(invalid.limit, 25);
  assert.equal(invalid.page, 1);
  assert.equal(invalid.data.length, 25);

  const beyond = await mock.mockListPayments({ page: 99 }, { latencyMs: 0, now: NOW });
  assert.equal(beyond.data.length, 0);
  assert.equal(beyond.total, 120);
  assert.equal(beyond.totalPages, 5);

  const filters = { status: "refunded", environment: "production", paymentMethod: "card" };
  const expected = mock.filterMockPayments(mock.generateMockPayments({ now: NOW }), filters);
  const withoutMatches = await mock.mockListPayments(filters, { latencyMs: 0, now: NOW });
  assert.equal(withoutMatches.total, expected.length);
  assert.equal(withoutMatches.totalPages, expected.length === 0 ? 0 : Math.ceil(expected.length / 25));
});

test("el simulador ordena por createdAt, amount y status en el servidor", async () => {
  const mock = loadMock();
  const dataset = mock.generateMockPayments({ now: NOW });

  const desc = await mock.mockListPayments({ sortBy: "createdAt", sortOrder: "desc", limit: 100 }, { latencyMs: 0, now: NOW });
  assert.equal(desc.data[0].id, dataset[0].id);
  for (let index = 1; index < desc.data.length; index += 1) {
    assert.ok(Date.parse(desc.data[index - 1].createdAt) >= Date.parse(desc.data[index].createdAt));
  }

  const asc = await mock.mockListPayments({ sortBy: "createdAt", sortOrder: "asc", limit: 100 }, { latencyMs: 0, now: NOW });
  assert.equal(asc.data[0].id, dataset[dataset.length - 1].id);
  for (let index = 1; index < asc.data.length; index += 1) {
    assert.ok(Date.parse(asc.data[index - 1].createdAt) <= Date.parse(asc.data[index].createdAt));
  }

  const byAmount = await mock.mockListPayments({ sortBy: "amount", sortOrder: "asc", limit: 100 }, { latencyMs: 0, now: NOW });
  for (let index = 1; index < byAmount.data.length; index += 1) {
    assert.ok(mock.compareDecimalStrings(byAmount.data[index - 1].amount, byAmount.data[index].amount) <= 0);
  }

  const byStatus = await mock.mockListPayments({ sortBy: "status", sortOrder: "asc", limit: 100 }, { latencyMs: 0, now: NOW });
  for (let index = 1; index < byStatus.data.length; index += 1) {
    assert.ok(byStatus.data[index - 1].status <= byStatus.data[index].status);
  }

  assert.ok(mock.compareDecimalStrings("9.00", "10.00") < 0);
  assert.ok(mock.compareDecimalStrings("1000.00", "999.99") > 0);
  assert.equal(mock.compareDecimalStrings("10.10", "10.10"), 0);
});

test("la búsqueda del simulador alcanza la referencia y el prefijo del UUID", async () => {
  const mock = loadMock();
  const payments = mock.generateMockPayments({ now: NOW });

  const byReference = await mock.mockListPayments({ search: "ORD-2026-0007" }, { latencyMs: 0, now: NOW });
  assert.equal(byReference.total, 1);
  assert.equal(byReference.data[0].merchantReference, "ORD-2026-0007");

  const caseInsensitive = await mock.mockListPayments({ search: "ord-2026-0007" }, { latencyMs: 0, now: NOW });
  assert.equal(caseInsensitive.total, 1);

  const prefix = payments[3].id.slice(0, 8);
  const byId = await mock.mockListPayments({ search: prefix }, { latencyMs: 0, now: NOW });
  assert.equal(byId.total, 1);
  assert.equal(byId.data[0].id, payments[3].id);

  const empty = await mock.mockListPayments({ search: "sin-coincidencias" }, { latencyMs: 0, now: NOW });
  assert.equal(empty.total, 0);
  assert.equal(empty.totalPages, 0);
  assert.deepEqual(clone(empty.data), []);
});

test("?mockError fuerza los errores del contrato y se ignora en producción", async () => {
  const rateLimited = loadMock({}, { window: { location: { search: "?status=approved&mockError=429" } } });
  await assert.rejects(
    rateLimited.mockListPayments({}, { latencyMs: 0, now: NOW }),
    (error) =>
      error.status === 429 &&
      error.code === "rate_limit_exceeded" &&
      error.message === "Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo." &&
      typeof error.requestId === "string",
  );

  const serverError = loadMock({}, { window: { location: { search: "?mockError=500" } } });
  await assert.rejects(
    serverError.mockListPayments({}, { latencyMs: 0, now: NOW }),
    (error) => error.status === 500 && error.requestId === "req_mock_500",
  );

  const validation = loadMock({}, { window: { location: { search: "?mockError=400" } } });
  await assert.rejects(
    validation.mockListPayments({}, { latencyMs: 0, now: NOW }),
    (error) => error.status === 400 && error.code === "validation_error",
  );

  const production = loadMock(
    { NODE_ENV: "production" },
    { window: { location: { search: "?mockError=429" } } },
  );
  const response = await production.mockListPayments({}, { latencyMs: 0, now: NOW });
  assert.equal(response.total, 120);

  const noWindow = loadMock();
  const withoutLocation = await noWindow.mockListPayments({}, { latencyMs: 0, now: NOW });
  assert.equal(withoutLocation.total, 120);
});

test("listPayments llama a GET /dashboard/payments sin tenantId cuando los mocks están desactivados", async () => {
  const calls = [];
  const api = loadPayments(
    { NEXT_PUBLIC_USE_MOCKS: "false" },
    {
      apiRequest: async (path, options) => {
        calls.push({ path, options });
        return okResponse;
      },
      mockListPayments: async () => {
        throw new Error("no debe usar el simulador");
      },
    },
  );

  await api.listPayments(
    {
      page: 2,
      limit: 10,
      status: "approved",
      from: "2026-10-10T04:00:00.000Z",
      to: "2026-10-17T04:00:00.000Z",
      paymentMethod: "card",
      environment: "sandbox",
      search: "ORD-2026",
      sortBy: "amount",
      sortOrder: "asc",
    },
    "signal-token",
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path.split("?")[0], "/dashboard/payments");
  const parsed = Object.fromEntries(new URL(calls[0].path, "http://dashboard.test").searchParams);
  assert.deepEqual(parsed, {
    page: "2",
    limit: "10",
    status: "approved",
    from: "2026-10-10T04:00:00.000Z",
    to: "2026-10-17T04:00:00.000Z",
    paymentMethod: "card",
    environment: "sandbox",
    search: "ORD-2026",
    sortBy: "amount",
    sortOrder: "asc",
  });
  assert.ok(!("tenantId" in parsed));
  assert.equal(calls[0].options.signal, "signal-token");
});

test("listPayments usa la API real si la variable de mocks no está definida", async () => {
  const calls = [];
  const api = loadPayments(
    {},
    {
      apiRequest: async (path) => {
        calls.push(path);
        return okResponse;
      },
      mockListPayments: async () => {
        throw new Error("no debe usar el simulador");
      },
    },
  );

  await api.listPayments({});
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "/dashboard/payments");
});

test("el simulador solo se activa con NEXT_PUBLIC_USE_MOCKS exactamente 'true' fuera de producción", async () => {
  const mockCalls = [];

  const devTrueCalls = [];
  const devTrue = loadPayments(
    { NEXT_PUBLIC_USE_MOCKS: "true" },
    {
      apiRequest: async (path) => {
        devTrueCalls.push(path);
        return okResponse;
      },
      mockListPayments: async (params, options) => {
        mockCalls.push({ params, options });
        return okResponse;
      },
    },
  );
  await devTrue.listPayments({ page: 3 });
  assert.equal(devTrueCalls.length, 0);
  assert.equal(mockCalls.length, 1);
  assert.equal(mockCalls[0].params.page, 3);
  assert.equal(mockCalls[0].options.latencyMs, 300);

  const truthyCalls = [];
  const truthy = loadPayments(
    { NEXT_PUBLIC_USE_MOCKS: "TRUE" },
    {
      apiRequest: async (path) => {
        truthyCalls.push(path);
        return okResponse;
      },
      mockListPayments: async () => {
        throw new Error("no debe usar el simulador");
      },
    },
  );
  await truthy.listPayments({});
  assert.equal(truthyCalls.length, 1);

  const productionCalls = [];
  const production = loadPayments(
    { NEXT_PUBLIC_USE_MOCKS: "true", NODE_ENV: "production" },
    {
      apiRequest: async (path) => {
        productionCalls.push(path);
        return okResponse;
      },
      mockListPayments: async () => {
        throw new Error("no debe usar el simulador en producción");
      },
    },
  );
  await production.listPayments({});
  assert.equal(productionCalls.length, 1);
  assert.equal(productionCalls[0], "/dashboard/payments");
});

test("buildPaymentsQueryString omite los parámetros vacíos y nunca agrega tenantId", () => {
  const api = loadPayments({ NEXT_PUBLIC_USE_MOCKS: "false" }, { apiRequest: async () => okResponse, mockListPayments: async () => okResponse });

  assert.equal(api.buildPaymentsQueryString({}), "");
  assert.equal(api.buildPaymentsQueryString({ status: "pending", search: "" }), "status=pending");

  const parsed = Object.fromEntries(
    new URLSearchParams(
      api.buildPaymentsQueryString({
        page: 1,
        limit: 25,
        status: "failed",
        from: "2026-10-16T04:00:00.000Z",
        to: "2026-10-17T04:00:00.000Z",
        paymentMethod: "bank_transfer",
        environment: "production",
        search: "ORD-2026-0001",
        sortBy: "status",
        sortOrder: "asc",
      }),
    ),
  );
  assert.deepEqual(parsed, {
    page: "1",
    limit: "25",
    status: "failed",
    from: "2026-10-16T04:00:00.000Z",
    to: "2026-10-17T04:00:00.000Z",
    paymentMethod: "bank_transfer",
    environment: "production",
    search: "ORD-2026-0001",
    sortBy: "status",
    sortOrder: "asc",
  });
  assert.ok(!("tenantId" in parsed));
});

test("usePaymentsList devuelve la clave, keepPreviousData y el reintento seguro", async () => {
  const keepPreviousData = (value) => value;
  const { exports: api } = load("lib/api/payments.ts", {
    imports: {
      "@/lib/api-client": { ApiError: FakeApiError, apiRequest: async () => okResponse },
      "./payments-mock": {
        mockListPayments: async (params) => ({ ...okResponse, total: 7, page: params.page ?? 1 }),
        MOCK_LATENCY_MS: 300,
      },
      "@tanstack/react-query": { useQuery: (config) => config, keepPreviousData },
    },
    env: { NEXT_PUBLIC_USE_MOCKS: "true" },
  });

  const params = { page: 4, limit: 10 };
  const config = api.usePaymentsList(params);
  assert.deepEqual(clone(config.queryKey), ["payments", "list", { page: 4, limit: 10 }]);
  assert.equal(config.placeholderData, keepPreviousData);
  assert.equal(config.enabled, true);

  const response = await config.queryFn({ signal: "signal" });
  assert.equal(response.total, 7);
  assert.equal(response.page, 4);

  assert.equal(config.retry(0, new FakeApiError(429, "rate", "rate_limit_exceeded")), false);
  assert.equal(config.retry(0, new FakeApiError(400, "bad", "validation_error")), false);
  assert.equal(config.retry(0, new FakeApiError(0, "offline")), true);
  assert.equal(config.retry(2, new FakeApiError(0, "offline")), false);
});
