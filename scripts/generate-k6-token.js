/**
 * Script auxiliar para generar un token JWT válido y mostrar una API Key de prueba
 * para ejecutar la prueba de latencia k6 (TSK-ARQ-308).
 *
 * Uso:
 *   node scripts/generate-k6-token.js
 */

const { createHmac } = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');

// Keep shell-provided values first, then load the API env and root env as fallbacks.
dotenv.config({ path: path.resolve(__dirname, '../apps/api/.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe estar configurada y tener al menos 32 caracteres.');
}

const expiresIn = Number.parseInt(process.env.JWT_EXPIRES_IN_SECONDS || '3600', 10);
if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
  throw new Error('JWT_EXPIRES_IN_SECONDS debe ser un entero positivo.');
}

const role = process.env.K6_ROLE || 'OWNER';
if (!['OWNER', 'PLATFORM_ADMIN'].includes(role)) {
  throw new Error('K6_ROLE debe ser OWNER o PLATFORM_ADMIN.');
}

// Generar un token JWT simulando un usuario OWNER/ADMIN del tenant
const payload = {
  id: '00000000-0000-4000-8000-000000000001', // ID de usuario de prueba
  email: 'admin@frogpay.test',
  role,
  tenantId: process.env.K6_TENANT_ID || '0e21495a-7a01-4dd7-8393-6c9cd724d752',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + expiresIn,
  iss: 'frogpay-api',
  aud: 'frogpay-dashboard',
};

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const header = encode({ alg: 'HS256', typ: 'JWT' });
const encodedPayload = encode(payload);
const unsignedToken = `${header}.${encodedPayload}`;
const signature = createHmac('sha256', jwtSecret)
  .update(unsignedToken)
  .digest('base64url');
const token = `${unsignedToken}.${signature}`;

if (process.argv.includes('--token-only')) {
  process.stdout.write(`${token}\n`);
  process.exit(0);
}

console.log('================================================================');
console.log('  CREDENCIALES GENERADAS PARA PRUEBA K6 (TSK-ARQ-308)');
console.log('================================================================\n');
console.log('🔑 JWT Token (para el BFF del Dashboard):');
console.log(token);
console.log('\n----------------------------------------------------------------\n');
console.log('🚀 Comando listo para ejecutar k6 en tu terminal:\n');
console.log(`k6 run scripts/k6-bank-transfer-latency.js \`
  -e BASE_URL=http://localhost:4000/api \`
  -e SANDBOX_API_KEY=sk_test_tu_api_key_aqui \`
  -e DASHBOARD_TOKEN=${token}`);
console.log('\n================================================================');
