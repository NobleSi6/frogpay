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
    URLSearchParams,
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

test("QR simulation consumes the authenticated dashboard simulator endpoint", async () => {
  const requests = [];
  const payments = load("features/payments/services/payments.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path, options) => {
        requests.push({ path, options });
        return { paymentId: "pay_qr_123", status: options.body.includes("APPROVED") ? "approved" : "failed", changed: true };
      },
    },
  });

  await payments.paymentsService.simulateQrPayment("pay_qr_123", "APPROVED");
  await payments.paymentsService.simulateQrPayment("pay_qr_123", "FAILED");

  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, "/dashboard/payments/pay_qr_123/simulate");
  assert.deepEqual(JSON.parse(requests[0].options.body), { result: "APPROVED" });
  assert.equal(requests[1].path, "/dashboard/payments/pay_qr_123/simulate");
  assert.deepEqual(JSON.parse(requests[1].options.body), { result: "FAILED" });
});

test("QR payments use the authenticated dashboard endpoint with the QR method", async () => {
  const requests = [];
  const qrResponse = {
    id: "pay_qr_123",
    status: "pending",
    amount: "42.50",
    currency: "BOB",
    paymentMethod: "qr",
    environment: "sandbox",
    merchantReference: "DASH-QR-qr-attempt-uuid",
    commissionAmount: "0.00",
    netAmount: "42.50",
    providerTransactionId: null,
    errorCode: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    qrPayload: "0002010102126304A1B2",
    expiresAt: "2026-10-06T00:15:00.000Z",
  };
  const payments = load("features/payments/services/payments.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path, options) => {
        requests.push({ path, options });
        return qrResponse;
      },
    },
  });

  const created = await payments.paymentsService.createQrPayment({
    amount: 42.5,
    currency: "BOB",
    idempotencyKey: "qr-attempt-uuid",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/dashboard/payments/test");
  assert.equal(requests[0].options.headers["Idempotency-Key"], "qr-attempt-uuid");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    amount: "42.50",
    currency: "BOB",
    paymentMethod: "qr",
    merchantReference: "DASH-QR-qr-attempt-uuid",
  });
  assert.equal(created.qrPayload, qrResponse.qrPayload);
  assert.equal(created.expiresAt, qrResponse.expiresAt);
});

test("bank transfers consume payment creation and deposit simulation endpoints", async () => {
  const requests = [];
  const paymentResponse = {
    id: "pay_bank_123",
    status: "pending",
    amount: "57.25",
    currency: "BOB",
    paymentMethod: "bank_transfer",
    environment: "sandbox",
    merchantReference: "DASH-BANK-bank-attempt-uuid",
    bankInstructions: {
      bankName: "Banco FrogPay Simulado",
      accountNumber: "10000012345",
      accountHolder: "FrogPay Bolivia S.R.L.",
      amount: "57.25",
      currency: "BOB",
      reference: "BT-2026-A81F92",
    },
    expiresAt: "2026-10-14T14:00:00.000Z",
    createdAt: "2026-10-14T13:00:00.000Z",
  };
  const bankTransfers = load("features/payments/services/bank-transfer.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path, options) => {
        requests.push({ path, options });
        return path.endsWith("simulate-deposit")
          ? { status: "reconciled", depositId: "deposit_123", paymentId: "pay_bank_123" }
          : paymentResponse;
      },
    },
    "./payments.service": {
      paymentsService: {
        getPaymentById: async () => ({ status: "PENDING" }),
      },
    },
  });
  const created = await bankTransfers.bankTransferService.createBankTransfer({
    amount: 57.25,
    currency: "BOB",
    idempotencyKey: "bank-attempt-uuid",
  });

  assert.equal(created.id, "pay_bank_123");
  assert.equal(created.paymentMethod, "bank_transfer");
  assert.equal(created.bankInstructions.reference, "BT-2026-A81F92");
  assert.equal(await bankTransfers.bankTransferService.getBankTransferStatus(created.id), "PENDING");
  await bankTransfers.bankTransferService.simulateBankDeposit(created.id, "DIFFERENT_AMOUNT");

  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, "/dashboard/payments/test");
  assert.equal(requests[0].options.headers["Idempotency-Key"], "bank-attempt-uuid");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    amount: "57.25",
    currency: "BOB",
    paymentMethod: "bank_transfer",
    merchantReference: "DASH-BANK-bank-attempt-uuid",
  });
  assert.equal(requests[1].path, "/dashboard/payments/pay_bank_123/simulate-deposit");
  assert.deepEqual(JSON.parse(requests[1].options.body), { mode: "amount_mismatch" });
});

test("bank reconciliation consumes paginated transactions and maps backend statuses", async () => {
  const requests = [];
  const reconciliation = load("features/payments/services/reconciliation.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path) => {
        requests.push(path);
        return {
          data: [
            {
              id: "transaction-1",
              reference: "BT-001",
              amount: "125.50",
              currency: "BOB",
              bankName: "Banco de Prueba",
              receivedAt: "2026-10-14T13:00:00.000Z",
              status: "reconciled",
              paymentId: "payment-1",
            },
            {
              id: "transaction-2",
              reference: "BT-002",
              amount: "90.00",
              currency: "BOB",
              bankName: "Banco de Prueba",
              receivedAt: "2026-10-14T12:00:00.000Z",
              status: "currency_mismatch",
              paymentId: null,
            },
          ],
          pagination: { total: 2, page: 1, limit: 100, totalPages: 1 },
        };
      },
    },
  });

  const page = await reconciliation.reconciliationService.getBankTransactions(1, 20);

  assert.deepEqual(requests, ["/dashboard/bank-transactions?page=1&limit=20"]);
  assert.equal(page.transactions[0].amount, 125.5);
  assert.equal(page.transactions[0].status, "CONCILIATED");
  assert.equal(page.transactions[0].paymentId, "payment-1");
  assert.equal(page.transactions[1].status, "CURRENCY_MISMATCH");
  assert.equal(page.transactions[1].paymentId, null);
  assert.equal(page.pagination.totalPages, 1);
});

test("webhook service consumes endpoint management and delivery endpoints", async () => {
  const requests = [];
  const webhooks = load("features/webhooks/services/webhooks.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path, options = {}) => {
        requests.push({ path, options });
        return {};
      },
    },
  });

  await webhooks.webhooksService.listEndpoints();
  await webhooks.webhooksService.getEndpoint("endpoint-1");
  await webhooks.webhooksService.createEndpoint({
    url: "https://merchant.example/webhooks",
    eventTypes: ["pago.aprobado"],
    environment: "sandbox",
  });
  await webhooks.webhooksService.updateEndpoint("endpoint-1", { isActive: false });
  await webhooks.webhooksService.deleteEndpoint("endpoint-1");
  await webhooks.webhooksService.rotateSecret("endpoint-1");
  await webhooks.webhooksService.sendTest("endpoint-1");
  await webhooks.webhooksService.listDeliveries({
    status: "failed",
    paymentId: "payment-1",
    page: 2,
    pageSize: 10,
  });
  await webhooks.webhooksService.getDelivery("delivery-1");
  await webhooks.webhooksService.retryDelivery("delivery-1");

  assert.deepEqual(requests.map(({ path, options }) => [path, options.method ?? "GET"]), [
    ["/dashboard/webhooks", "GET"],
    ["/dashboard/webhooks/endpoint-1", "GET"],
    ["/dashboard/webhooks", "POST"],
    ["/dashboard/webhooks/endpoint-1", "PATCH"],
    ["/dashboard/webhooks/endpoint-1", "DELETE"],
    ["/dashboard/webhooks/endpoint-1/rotate-secret", "POST"],
    ["/dashboard/webhooks/endpoint-1/test", "POST"],
    ["/dashboard/webhook-deliveries?status=failed&paymentId=payment-1&page=2&pageSize=10", "GET"],
    ["/dashboard/webhook-deliveries/delivery-1", "GET"],
    ["/dashboard/webhook-deliveries/delivery-1/retry", "POST"],
  ]);
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    url: "https://merchant.example/webhooks",
    eventTypes: ["pago.aprobado"],
    environment: "sandbox",
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
