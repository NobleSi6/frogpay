import http from 'k6/http';
import { check, sleep } from 'k6';

// Each iteration creates and reconciles a sandbox payment; use only a test database.
const baseUrl = (__ENV.BASE_URL || 'http://localhost:4000/api').replace(/\/+$/, '');
const apiKey = __ENV.SANDBOX_API_KEY;
const dashboardToken = __ENV.DASHBOARD_TOKEN;
const p95LimitMs = Number(__ENV.P95_LIMIT_MS || 2500);

if (!apiKey) {
  throw new Error('Define SANDBOX_API_KEY con una API key sandbox antes de ejecutar k6.');
}

if (!dashboardToken) {
  throw new Error('Define DASHBOARD_TOKEN ejecutando scripts/generate-k6-token.js.');
}

if (!Number.isFinite(p95LimitMs) || p95LimitMs <= 0) {
  throw new Error('P95_LIMIT_MS debe ser un número positivo.');
}

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: [`p(95)<${p95LimitMs}`],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const idempotencyKey = createIdempotencyKey();
  const response = http.post(
    `${baseUrl}/v1/payments`,
    JSON.stringify({
      amount: '1.00',
      currency: 'BOB',
      paymentMethod: 'bank_transfer',
      merchantReference: `k6-${idempotencyKey}`,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dashboardToken}`,
        'X-Api-Key': apiKey,
        'Idempotency-Key': idempotencyKey,
      },
      tags: { endpoint: 'create-bank-transfer-payment' },
    },
  );

  let body;
  try {
    body = response.json();
  } catch {
    body = {};
  }

  check(response, {
    'payment created': (res) => res.status === 201,
    'payment is pending': () => body.status === 'pending',
    'bank transfer instructions returned': () =>
      typeof body.bankInstructions?.reference === 'string',
  });

  if (response.status !== 201 || typeof body.id !== 'string') {
    sleep(1);
    return;
  }

  const reconciliation = http.post(
    `${baseUrl}/dashboard/payments/${encodeURIComponent(body.id)}/simulate-deposit`,
    JSON.stringify({ mode: 'exact' }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dashboardToken}`,
      },
      tags: { endpoint: 'reconcile-bank-transfer-deposit' },
    },
  );
  let reconciliationBody;
  try {
    reconciliationBody = reconciliation.json();
  } catch {
    reconciliationBody = {};
  }

  check(reconciliation, {
    'deposit reconciled': (res) => res.status === 200,
    'payment was matched': () => reconciliationBody.status === 'reconciled',
  });
  sleep(1);
}

function createIdempotencyKey() {
  const time = Date.now().toString(16).padStart(12, '0').slice(-12);
  const vu = Number(__VU).toString(16).padStart(4, '0').slice(-4);
  const iteration = Number(__ITER).toString(16).padStart(8, '0').slice(-8);
  const random = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  let hex = `${time}${vu}${iteration}${random}`.slice(0, 32);
  const variant = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)];
  hex = `${hex.slice(0, 12)}4${hex.slice(13, 16)}${variant}${hex.slice(17)}`;

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
