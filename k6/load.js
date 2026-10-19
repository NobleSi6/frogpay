/**
 * Prueba de carga principal (TSK-DEV2-404 · RNF-01 / RNF-06).
 * Target: p95 < 300 ms en POST /v1/payments con 2 réplicas detrás de NGINX.
 *
 * Ejecutar:
 *   docker compose --profile proxy up -d --scale api=2
 *   k6 run --env BASE_URL=https://localhost:8443 --insecure-skip-tls-verify k6/load.js
 */
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { BASE_URL, login, authHeaders } from "./libs/auth.js";
import { createCardPayment, getPayment } from "./libs/payments.js";
import http from "k6/http";

const paymentCreationDuration = new Trend(
  "frogpay_payment_creation_duration",
  true,
);
const paymentErrors = new Counter("frogpay_payment_errors");
const diagnosticOnly = __ENV.K6_RATE_LIMIT_DIAGNOSTIC_ONLY === "true";

export const options = {
  scenarios: diagnosticOnly
    ? {
        rate_limit_diagnostic: {
          executor: "shared-iterations",
          vus: 1,
          iterations: 1,
        },
      }
    : {
        ramp_up: {
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "1m", target: 30 },
            { duration: "3m", target: 30 },
            { duration: "1m", target: 0 },
          ],
        },
      },
  thresholds: diagnosticOnly
    ? {}
    : {
        frogpay_payment_creation_duration: ["p(95)<300"],
        http_req_failed: ["rate<0.01"],
        http_req_duration: ["p(99)<1000"],
      },
};

export function setup() {
  const session = login();

  const res = http.get(`${BASE_URL}/api/dashboard/payment-methods`, {
    headers: authHeaders(session.token),
  });

  console.log(
    `Rate limit diagnóstico: HTTP ${res.status}, ` +
      `limit=${res.headers["X-RateLimit-Limit"]}, ` +
      `remaining=${res.headers["X-RateLimit-Remaining"]}`,
  );

  return session;
}

export default function ({ token }) {
  if (diagnosticOnly) return;

  const roll = Math.random();

  if (roll < 0.7) {
    // 70% – Crear pago con tarjeta
    const { res } = createCardPayment();
    paymentCreationDuration.add(res.timings.duration);
    const ok = check(res, {
      "POST /v1/payments (card) 20x": (r) =>
        r.status === 200 || r.status === 201,
    });
    if (!ok) paymentErrors.add(1);

    // GET del pago recién creado
    const paymentId = res.json("id");
    if (paymentId) {
      const getRes = getPayment(paymentId);
      check(getRes, { "GET /v1/payments/:id 200": (r) => r.status === 200 });
    }
  } else if (roll < 0.85) {
    // 15% – Consultar pago en el dashboard
    const { res: createRes } = createCardPayment();
    const paymentId = createRes.json("id");
    if (paymentId) {
      const dashRes = http.get(
        `${BASE_URL}/api/dashboard/payments/${paymentId}`,
        {
          headers: authHeaders(token),
          tags: { name: "GET /api/dashboard/payments/:id" },
        },
      );
      check(dashRes, {
        "GET /dashboard/payments/:id 200": (r) => r.status === 200,
      });
    }
  } else {
    // 15% – Métodos de pago (solo lectura)
    const methodsRes = http.get(`${BASE_URL}/api/dashboard/payment-methods`, {
      headers: authHeaders(token),
    });
    check(methodsRes, {
      "GET /dashboard/payment-methods 200": (r) => r.status === 200,
    });
  }

  sleep(Math.random() * 0.5);
}
