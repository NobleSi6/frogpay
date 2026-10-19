/**
 * Concurrent idempotency test (TSK-DEV2-404).
 * Every VU submits the same request and idempotency key through the shared Redis store.
 *
 * Run:
 *   docker compose -f docker-compose.yml -f docker-compose.k6.yml --profile proxy up -d --scale api=2
 *   k6 run --env BASE_URL=https://localhost:8443 --insecure-skip-tls-verify k6/idempotency.js
 */
import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import { BASE_URL, paymentHeaders, uuidv4 } from "./libs/auth.js";

const newPaymentResponses = new Counter("frogpay_new_payment_responses");
const sharedKey = uuidv4();

http.setResponseCallback(http.expectedStatuses(200, 201, 409));

export const options = {
  scenarios: {
    concurrent_idempotency: {
      executor: "constant-vus",
      vus: 20,
      duration: "30s",
    },
  },
  thresholds: {
    frogpay_new_payment_responses: ["count==1"],
    http_req_failed: ["rate<0.05"],
    checks: ["rate>0.99"],
  },
};

export function setup() {
  return { key: sharedKey };
}

export default function ({ key }) {
  const res = http.post(
    `${BASE_URL}/api/v1/payments`,
    JSON.stringify({
      amount: "1.00",
      currency: "BOB",
      paymentMethod: "card",
      paymentToken: "pm_k6_idempotency_test",
      merchantReference: `k6-idempotency-${key}`,
    }),
    { headers: paymentHeaders(key) },
  );

  const statusAccepted =
    res.status === 200 || res.status === 201 || res.status === 409;
  check(res, { "idempotency returns 200, 201 or 409": () => statusAccepted });
  if (res.status === 201) {
    newPaymentResponses.add(1);
  }
}
