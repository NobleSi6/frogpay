import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => imports[name], setTimeout, process: { env: {} }, ...globals });
  return { exports, source };
}

test("sandbox Stripe credentials require test prefixes", () => {
  const { exports: validation } = load("features/provider-credentials/stripe-credentials-validation.ts", { "./provider-credentials-client": {} });
  assert.deepEqual({ ...validation.validateStripeCredentials("sandbox", "pk_live_value", "sk_live_value") }, {
    publishableKey: "La clave sandbox debe comenzar con pk_test_.",
    secretKey: "La clave sandbox debe comenzar con sk_test_.",
  });
  assert.deepEqual({ ...validation.validateStripeCredentials("sandbox", "pk_test_value", "sk_test_value") }, {});
});

test("production Stripe credentials require live prefixes", () => {
  const { exports: validation } = load("features/provider-credentials/stripe-credentials-validation.ts", { "./provider-credentials-client": {} });
  assert.deepEqual({ ...validation.validateStripeCredentials("production", "pk_test_value", "sk_test_value") }, {
    publishableKey: "La clave de producción debe comenzar con pk_live_.",
    secretKey: "La clave de producción debe comenzar con sk_live_.",
  });
  assert.deepEqual({ ...validation.validateStripeCredentials("production", "pk_live_value", "sk_live_value") }, {});
});

test("provider API client uses the verified GET and PUT contract", async () => {
  const requests = [];
  const apiRequest = async (path, options) => {
    requests.push({ path, options });
    return { environment: "sandbox", configured: true, publishableKey: "pk_test_value", secretKeyMasked: "sk_test_...alue" };
  };
  const { exports: client, source } = load(
    "features/provider-credentials/provider-credentials-client.ts",
    { "@/lib/api-client": { apiRequest } },
  );
  await client.providerCredentialsClient.getStripeCredentials("sandbox");
  await client.providerCredentialsClient.saveStripeCredentials({ environment: "sandbox", publishableKey: "pk_test_value", secretKey: "sk_test_sensitive" });
  assert.equal(requests[0].path, "/tenants/me/providers/stripe/credentials/sandbox");
  assert.equal(requests[0].options, undefined);
  assert.equal(requests[1].path, "/tenants/me/providers/stripe/credentials/sandbox");
  assert.equal(requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[1].options.body), { publishableKey: "pk_test_value", secretKey: "sk_test_sensitive" });
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal(source.includes("console."), false);
});

test("central error map covers every Sprint 2 code with message and action", () => {
  const { exports: errors } = load("config/frogpay-errors.ts");
  assert.equal(errors.FROGPAY_ERROR_CODES.length, 11);
  for (const code of errors.FROGPAY_ERROR_CODES) {
    assert.ok(errors.FROGPAY_ERRORS[code].message);
    assert.ok(errors.FROGPAY_ERRORS[code].action);
  }
  assert.deepEqual({ ...errors.getFrogPayError("unknown_backend_code") }, { ...errors.UNKNOWN_FROGPAY_ERROR });
  assert.match(errors.UNKNOWN_FROGPAY_ERROR.action, /\+591 71587251/);
  assert.match(errors.UNKNOWN_FROGPAY_ERROR.action, /frog@support\.com/);
});
