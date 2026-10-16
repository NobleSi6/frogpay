import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, env, fetch, imports = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => imports[name], process: { env }, fetch, Headers, AbortSignal, ...globals });
  return exports;
}
const env = { NODE_ENV: "development", NEXT_PUBLIC_API_URL: "http://api.example.test", NEXT_PUBLIC_API_DEV_MODE: "true", NEXT_PUBLIC_DEMO_MODE: "false" };
function fixture(response = {}, status = 200) {
  const calls = [];
  const client = load("lib/api-client.ts", env, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(response), { status });
  }, { "./demo-mode": { SPRINT1_DEMO_MODE: false }, "@/features/auth/auth-session": { getSession: () => ({ accessToken: "real-token" }), setSession: () => {} } });
  return { calls, client, service: file => load(file, env, undefined, { "@/lib/api-client": client }) };
}

test("activation uses the public contract and normalizes email", async () => {
  const f = fixture({ message: "Cuenta activada" });
  await f.service("features/auth/services/activation-service.ts").activateInvitation(" OWNER@EXAMPLE.COM ", "token-test", "password-test");
  assert.equal(f.calls[0].url, "http://api.example.test/api/identity/activate-invitation");
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { email: "owner@example.com", token: "token-test", password: "password-test" });
  assert.equal(f.calls[0].options.headers.get("x-user-role"), null);
});
test("tenant DTO uses metadata and drops initial secrets from the service result", async () => {
  const f = fixture({ id: "tenant", name: "Empresa", contactEmail: "owner@example.com", createdAt: "2026-09-29", owner: {}, invitationQueued: true, apiKeys: [{ rawKey: "must-not-retain" }] }, 201);
  const result = await f.service("features/tenants/services/tenant-service.ts").createTenant({ company: "Empresa", legalName: "Empresa SAS", taxId: "12345", address: "Demo address", email: "owner@example.com" });
  assert.deepEqual(JSON.parse(f.calls[0].options.body), { name: "Empresa", taxId: "12345", contactEmail: "owner@example.com", metadata: { businessName: "Empresa SAS", fiscalAddress: "Demo address" } });
  assert.equal("apiKeys" in result, false);
  assert.equal(f.calls[0].options.headers.get("Authorization"), "Bearer real-token");
});
test("API keys use real GET, POST, DELETE and atomic regeneration endpoints", async () => {
  const f = fixture([]);
  const service = f.service("features/api-keys/services/api-key-service.ts");
  await service.listApiKeys("tenant-id");
  await service.generateApiKey("tenant-id");
  await service.revokeApiKey("tenant-id", "key-id");
  await service.regenerateApiKey("tenant-id", "key-id");
  assert.deepEqual(f.calls.map(call => [call.options.method ?? "GET", call.url]), [
    ["GET", "http://api.example.test/api/tenants/tenant-id/api-keys"],
    ["POST", "http://api.example.test/api/tenants/tenant-id/api-keys"],
    ["DELETE", "http://api.example.test/api/tenants/tenant-id/api-keys/key-id"],
    ["POST", "http://api.example.test/api/tenants/tenant-id/api-keys/key-id/regenerate"],
  ]);
  assert.deepEqual(JSON.parse(f.calls[1].options.body), { name: "Dashboard Test API Key", type: "test" });
});
test("validation, duplicate and forbidden errors keep status and useful messages", async () => {
  for (const status of [400, 401, 403, 409]) {
    const f = fixture({ message: ["Error de validación", "Detalle"] }, status);
    await assert.rejects(f.client.apiRequest("/test"), error => error.status === status && error.message === "Error de validación Detalle");
  }
});
test("API errors preserve the centralized backend code", async () => {
  const f = fixture({ code: "provider_timeout", message: "technical provider detail", requestId: "request-id" }, 422);
  await assert.rejects(
    f.client.apiRequest("/test"),
    error => error.status === 422 && error.code === "provider_timeout",
  );
});
test("server errors do not leak internals and network failures remain errors", async () => {
  const f = fixture({ message: "database-password-sensitive" }, 500);
  await assert.rejects(f.client.apiRequest("/test"), error => error.status === 500 && !error.message.includes("password"));
  const client = load("lib/api-client.ts", env, async () => { throw new Error("network"); }, { "./demo-mode": { SPRINT1_DEMO_MODE: false }, "@/features/auth/auth-session": { getSession: () => null, setSession: () => {} } });
  await assert.rejects(client.apiRequest("/test"), error => error.status === 0);
});
test("demo credentials remain isolated in the explicit demo adapter", () => {
  const auth = load("features/auth/mock-auth.ts", env, undefined, {
  });

  assert.equal(auth.loginMock("incorrecto@frogpay.test", "incorrecta"), null);
  assert.equal(auth.loginMock("admin@frogpay.test", "Admin123!").redirect, "/admin");
  assert.equal(auth.loginMock("owner@acme.test", "Owner123!").redirect, "/dashboard");
});
