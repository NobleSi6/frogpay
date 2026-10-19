import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, login, authHeaders } from './libs/auth.js';
import { createCardPayment, getPayment } from './libs/payments.js';
import http from 'k6/http';

export const options = {
  vus: 1,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

const paymentCreationDuration = new Trend('frogpay_payment_creation_duration', true);

export function setup() {
  return login();
}

export default function ({ token }) {
  // POST /v1/payments – tarjeta (mock)
  const { res: cardRes } = createCardPayment();
  check(cardRes, { 'POST /v1/payments (card) 20x': (r) => r.status === 200 || r.status === 201 });
  paymentCreationDuration.add(cardRes.timings.duration);
  const cardId = cardRes.json('id');

  // GET /v1/payments/:id
  if (cardId) {
    const getRes = getPayment(cardId);
    check(getRes, { 'GET /v1/payments/:id 200': (r) => r.status === 200 });

    // GET /dashboard/payments/:id
    const dashRes = http.get(`${BASE_URL}/api/dashboard/payments/${cardId}`, { headers: authHeaders(token) });
    check(dashRes, { 'GET /dashboard/payments/:id 200': (r) => r.status === 200 });
  }

  // GET /dashboard/payment-methods
  const methodsRes = http.get(`${BASE_URL}/api/dashboard/payment-methods`, { headers: authHeaders(token) });
  check(methodsRes, { 'GET /dashboard/payment-methods 200': (r) => r.status === 200 });

  sleep(2);
}
