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
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: false },
    "./bank-transfer.service": { getMockBankTransfer: () => undefined },
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

test("QR payments can be created, viewed and simulated in demo mode without the API", async () => {
  const payments = load("features/payments/services/payments.service.ts", {
    "@/lib/api-client": {
      apiRequest: async () => {
        throw new Error("Demo QR payments must not call the API.");
      },
    },
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: true },
    "./bank-transfer.service": { getMockBankTransfer: () => undefined },
  });

  const created = await payments.paymentsService.createQrPayment({
    amount: 42.5,
    currency: "BOB",
    idempotencyKey: "qr-attempt-uuid",
  });

  assert.equal(created.paymentMethod, "qr");
  assert.equal(created.status, "pending");
  assert.ok(created.qrPayload);
  assert.ok(created.expiresAt);

  const pending = await payments.paymentsService.getPaymentById(created.id);
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.amount, 42.5);
  assert.equal(pending.qrPayload, created.qrPayload);

  await payments.paymentsService.simulateQrPayment(created.id, "APPROVED");
  const approved = await payments.paymentsService.getPaymentById(created.id);
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.timeline.at(-1).status, "approved");

  const rejectedPayment = await payments.paymentsService.createQrPayment({
    amount: 19,
    currency: "BOB",
    idempotencyKey: "qr-rejected-attempt",
  });
  await payments.paymentsService.simulateQrPayment(rejectedPayment.id, "REJECTED");
  const rejected = await payments.paymentsService.getPaymentById(rejectedPayment.id);
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.timeline.at(-1).status, "rejected");
});

test("QR simulations use the supported dashboard endpoint and status", async () => {
  const requests = [];
  const payments = load("features/payments/services/payments.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path, options) => {
        requests.push({ path, options });
      },
    },
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: false },
    "./bank-transfer.service": { getMockBankTransfer: () => undefined },
  });

  await payments.paymentsService.simulateQrPayment("payment-id", "REJECTED");

  assert.equal(requests[0].path, "/dashboard/payments/payment-id/simulate");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), { result: "FAILED" });
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
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: false },
    "./bank-transfer.service": { getMockBankTransfer: () => undefined },
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

test("bank transfers run entirely in the sandbox mock without calling the API", async () => {
  const imports = {
    "@/lib/api-client": { apiRequest: async () => { throw new Error("Demo bank transfers must not call the API."); } },
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: true },
  };
  const bankTransfers = load("features/payments/services/bank-transfer.service.ts", imports);
  const created = await bankTransfers.bankTransferService.createBankTransfer({
    amount: 57.25,
    currency: "BOB",
    idempotencyKey: "bank-attempt-uuid",
  });

  assert.equal(created.paymentMethod, "bank_transfer");
  assert.equal(created.status, "pending");
  assert.equal(created.bankInstructions.amount, "57.25 BOB");
  assert.equal(await bankTransfers.bankTransferService.getBankTransferStatus(created.id), "PENDING");

  await bankTransfers.bankTransferService.simulateBankDeposit(created.id, "EXACT");
  assert.equal(await bankTransfers.bankTransferService.getBankTransferStatus(created.id), "APPROVED");

  const rejectedTransfer = await bankTransfers.bankTransferService.createBankTransfer({
    amount: 12,
    currency: "BOB",
    idempotencyKey: "bank-rejected-attempt",
  });
  await bankTransfers.bankTransferService.simulateBankDeposit(rejectedTransfer.id, "DIFFERENT_AMOUNT");
  assert.equal(await bankTransfers.bankTransferService.getBankTransferStatus(rejectedTransfer.id), "REJECTED");

  const unmatchedTransfer = await bankTransfers.bankTransferService.createBankTransfer({
    amount: 8,
    currency: "BOB",
    idempotencyKey: "bank-unmatched-attempt",
  });
  await bankTransfers.bankTransferService.simulateBankDeposit(unmatchedTransfer.id, "UNKNOWN_REFERENCE");
  assert.equal(await bankTransfers.bankTransferService.getBankTransferStatus(unmatchedTransfer.id), "PENDING");

  const payments = load("features/payments/services/payments.service.ts", {
    "./bank-transfer.service": bankTransfers,
    "@/lib/api-client": { apiRequest: async () => { throw new Error("Mock transfer details must not call the API."); } },
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: false },
  });
  const detail = await payments.paymentsService.getPaymentById(created.id);
  assert.equal(detail.paymentMethod, "bank_transfer");
  assert.equal(detail.status, "APPROVED");
  assert.equal(detail.amount, 57.25);
});

test("bank transfers create, simulate and read status through dashboard endpoints", async () => {
  const requests = [];
  const apiResponse = {
    id: "payment-uuid",
    status: "pending",
    amount: "57.25",
    currency: "BOB",
    paymentMethod: "bank_transfer",
    environment: "sandbox",
    merchantReference: "DASH-BANK-bank-attempt-uuid",
    commissionAmount: null,
    netAmount: null,
    providerTransactionId: null,
    errorCode: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    expiresAt: "2026-10-07T00:00:00.000Z",
    bankInstructions: {
      bankName: "Banco de Prueba",
      accountNumber: "10000012345",
      accountHolder: "FrogPay",
      amount: "57.25",
      currency: "BOB",
      reference: "BT-2026-A81F92",
    },
  };
  const bankTransfers = load("features/payments/services/bank-transfer.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path, options) => {
        requests.push({ path, options });
        return path.endsWith("/simulate-deposit")
          ? { status: "reconciled", depositId: "deposit-uuid", paymentId: "payment-uuid" }
          : path === "/dashboard/payments/test"
            ? apiResponse
            : { status: "approved" };
      },
    },
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: false },
  });

  const created = await bankTransfers.bankTransferService.createBankTransfer({
    amount: 57.25,
    currency: "BOB",
    idempotencyKey: "bank-attempt-uuid",
  });
  await bankTransfers.bankTransferService.simulateBankDeposit(created.id, "EXACT");
  const status = await bankTransfers.bankTransferService.getBankTransferStatus(created.id);

  assert.equal(created.id, "payment-uuid");
  assert.equal(created.status, "pending");
  assert.equal(created.bankInstructions.reference, "BT-2026-A81F92");
  assert.equal(status, "APPROVED");
  assert.equal(requests[0].path, "/dashboard/payments/test");
  assert.equal(requests[0].options.headers["Idempotency-Key"], "bank-attempt-uuid");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    amount: "57.25",
    currency: "BOB",
    paymentMethod: "bank_transfer",
    merchantReference: "DASH-BANK-bank-attempt-uuid",
  });
  assert.equal(requests[1].path, "/dashboard/payments/payment-uuid/simulate-deposit");
  assert.deepEqual(JSON.parse(requests[1].options.body), { mode: "exact" });
  assert.equal(requests[2].path, "/dashboard/payments/payment-uuid");
});

test("bank reconciliation maps the paginated dashboard response", async () => {
  const requests = [];
  const reconciliation = load("features/payments/services/reconciliation.service.ts", {
    "@/lib/api-client": {
      apiRequest: async (path) => {
        requests.push(path);
        return {
          data: [
            {
              id: "deposit-1",
              reference: "BT-2026-A81F92",
              amount: "57.25",
              currency: "BOB",
              bankName: "Banco de Prueba",
              receivedAt: "2026-10-06T10:00:00.000Z",
              status: "reconciled",
              paymentId: "payment-uuid",
            },
            {
              id: "deposit-2",
              reference: "BT-UNKNOWN-1",
              amount: "15.00",
              currency: "BOB",
              bankName: "Banco de Prueba",
              receivedAt: "2026-10-06T11:00:00.000Z",
              status: "unmatched",
              paymentId: null,
            },
            {
              id: "deposit-3",
              reference: "BT-2026-B82F93",
              amount: "20.00",
              currency: "BOB",
              bankName: "Banco de Prueba",
              receivedAt: "2026-10-06T12:00:00.000Z",
              status: "currency_mismatch",
              paymentId: "payment-2",
            },
          ],
          pagination: { total: 3, page: 1, limit: 100, totalPages: 1 },
        };
      },
    },
  });

  const transactions = await reconciliation.reconciliationService.getBankTransactions();

  assert.deepEqual(requests, ["/dashboard/bank-transactions?page=1&limit=100"]);
  assert.equal(transactions.length, 3);
  assert.equal(transactions[0].status, "CONCILIATED");
  assert.equal(transactions[0].amount, 57.25);
  assert.equal(transactions[0].paymentId, "payment-uuid");
  assert.equal(transactions[1].status, "WITHOUT_REFERENCE");
  assert.equal(transactions[1].paymentId, undefined);
  assert.equal(transactions[2].status, "CURRENCY_MISMATCH");
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
    "@/lib/demo-mode": { SPRINT1_DEMO_MODE: false },
    "./bank-transfer.service": { getMockBankTransfer: () => undefined },
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
