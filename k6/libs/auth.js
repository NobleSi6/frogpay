import http from "k6/http";
import { check, fail } from "k6";

export const BASE_URL = (__ENV.BASE_URL || "http://localhost:8080").replace(
  /\/+$/,
  "",
);
export const API_KEY = __ENV.K6_API_KEY || "";

export function login() {
  const email = __ENV.K6_EMAIL || "";
  const password = __ENV.K6_PASSWORD || "";
  if (!email || !password || !API_KEY) {
    fail("Debes configurar K6_EMAIL, K6_PASSWORD y K6_API_KEY");
  }
  const res = http.post(
    `${BASE_URL}/api/identity/login`,
    JSON.stringify({ email, password }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, { "login 200": (r) => r.status === 200 }) ||
    fail(`login falló: HTTP ${res.status} ${res.body}`);
  const body = res.json();
  return { token: body.accessToken, tenantId: body.user?.tenant?.id };
}

export function authHeaders(token, extra = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

export function paymentHeaders(idempotencyKey) {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": API_KEY,
    "Idempotency-Key": idempotencyKey,
  };
}
