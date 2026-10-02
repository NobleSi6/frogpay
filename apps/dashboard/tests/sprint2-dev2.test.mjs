import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, imports = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => imports[name], setTimeout });
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

test("provider client returns only a masked secret and declares the pending contract", async () => {
  const { exports: client, source } = load("features/provider-credentials/provider-credentials-client.ts");
  const result = await client.providerCredentialsClient.saveStripeCredentials({ tenantId: "tenant", environment: "sandbox", publishableKey: "pk_test_value", secretKey: "sk_test_sensitive" });
  assert.equal(result.maskedSecret, client.MASKED_PROVIDER_SECRET);
  assert.equal(JSON.stringify(result).includes("sk_test_sensitive"), false);
  assert.equal(client.PROVIDER_CREDENTIALS_INTEGRATION.status, "pending-backend-contract");
  assert.equal(source.includes("apiRequest"), false);
});

test("central error map covers every Sprint 2 code with message and action", () => {
  const { exports: errors } = load("config/frogpay-errors.ts");
  assert.equal(errors.FROGPAY_ERROR_CODES.length, 11);
  for (const code of errors.FROGPAY_ERROR_CODES) {
    assert.ok(errors.FROGPAY_ERRORS[code].message);
    assert.ok(errors.FROGPAY_ERRORS[code].action);
  }
});
