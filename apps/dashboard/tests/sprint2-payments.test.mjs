import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => imports[name],
    process: { env: {} },
    ...globals,
  });
  return exports;
}

test("payment retries reuse the supplied idempotency key and identical request body", async () => {
  const requests = [];
  const apiRequest = async (path, options) => {
    requests.push({ path, options });
    return { id: "pay_123", status: "approved" };
  };
  const payments = load("features/payments/services/payments.service.ts", {
    "@/lib/api-client": { apiRequest },
  });
  const attempt = {
    amount: 100,
    currency: "BOB",
    paymentMethodId: "pm_test_123",
    idempotencyKey: "attempt-uuid",
  };

  await payments.paymentsService.createPayment(attempt);
  await payments.paymentsService.createPayment(attempt);

  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, "/dashboard/payments/test");
  assert.equal(requests[0].options.headers["Idempotency-Key"], "attempt-uuid");
  assert.equal(requests[1].options.headers["Idempotency-Key"], "attempt-uuid");
  assert.equal(requests[0].options.body, requests[1].options.body);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    amount: "100.00",
    currency: "BOB",
    paymentMethod: "card",
    merchantReference: "DASH-attempt-uuid",
    paymentToken: "pm_test_123",
  });
});

test("payment details preserve a failed result and its API error code", async () => {
  const apiRequest = async () => ({
    id: "pay_123",
    status: "failed",
    amount: "100.00",
    currency: "BOB",
    paymentMethod: "card",
    environment: "sandbox",
    merchantReference: "DASH-attempt-uuid",
    commissionAmount: "3.50",
    netAmount: "96.50",
    errorCode: "provider_timeout",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    statusHistory: [],
  });
  const payments = load("features/payments/services/payments.service.ts", {
    "@/lib/api-client": { apiRequest },
  });

  const detail = await payments.paymentsService.getPaymentById("pay_123");

  assert.equal(detail.status, "FAILED");
  assert.equal(detail.errorCode, "provider_timeout");
  assert.equal(detail.fee, 3.5);
  assert.equal(detail.net, 96.5);
  assert.equal(detail.environment, "sandbox");
});

test("API errors retain code, details, requestId and attach the JWT", async () => {
  let requestHeaders;
  const apiClient = load("lib/api-client.ts", {
    "./demo-mode": { SPRINT1_DEMO_MODE: false },
    "@/features/auth/auth-session": {
      getSession: () => ({ accessToken: "session-jwt" }),
      setSession: () => {},
    },
  }, {
    process: { env: { NEXT_PUBLIC_API_URL: "http://localhost:4000" } },
    Headers,
    AbortSignal,
    fetch: async (_url, options) => {
      requestHeaders = options.headers;
      return {
        ok: false,
        status: 422,
        json: async () => ({
          code: "validation_error",
          message: "Raw backend message",
          details: { amount: "invalid" },
          requestId: "req_123",
        }),
      };
    },
  });

  await assert.rejects(
    apiClient.apiRequest("/dashboard/payments/test", { method: "POST", body: "{}" }),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.code, "validation_error");
      assert.deepEqual({ ...error.details }, { amount: "invalid" });
      assert.equal(error.requestId, "req_123");
      return true;
    },
  );
  assert.equal(requestHeaders.get("Authorization"), "Bearer session-jwt");
});
