import http from "k6/http";
import { check } from "k6";
import { BASE_URL, paymentHeaders, API_KEY } from "./auth.js";

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createCardPayment(idempotencyKey) {
  const key = idempotencyKey || uuidv4();
  const res = http.post(
    `${BASE_URL}/api/v1/payments`,
    JSON.stringify({
      amount: "150.00",
      currency: "BOB",
      paymentMethod: "card",
      paymentToken: "pm_mock_visa_approved",
      merchantReference: "k6-card-" + key.slice(0, 8),
    }),
    { headers: paymentHeaders(key) },
  );
  return { res, idempotencyKey: key };
}

export function getPayment(paymentId) {
  return http.get(`${BASE_URL}/api/v1/payments/${paymentId}`, {
    headers: { "X-Api-Key": API_KEY },
    tags: { name: "GET /api/v1/payments/:id" },
  });
}
