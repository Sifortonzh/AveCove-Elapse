// Run against a disposable local development server with SMTP disabled.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.ELAPSE_TEST_URL || "http://127.0.0.1:3212");
assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Only run against a local test server");
const suffix = randomUUID().slice(0, 8);

async function api(path, { method = "GET", cookie, body, scope, accountId } = {}) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      "x-forwarded-for": `local-fixture-${suffix}`,
      ...(cookie ? { cookie } : {}),
      ...(scope ? { "x-elapse-ai-scope": scope } : {}),
      ...(accountId ? { "x-elapse-account-id": accountId } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

const getConfig = session => api("/api/account/ai", { cookie: session.cookie });

async function signIn(email, studentId) {
  const sent = await api("/api/auth/email-code", { method: "POST", body: { email } });
  assert.equal(sent.status, 200);
  assert.match(sent.body.debugCode, /^\d{6}$/, "Development SMTP must be disabled");
  const result = await api("/api/auth/session", { method: "POST", body: { email, studentId, code: sent.body.debugCode, nickname: "Synthetic AI check" } });
  assert.equal(result.status, 200);
  assert.ok(result.cookie);
  return result;
}

const studentA = `A-${suffix}`;
const emailA = `ai-a-${suffix}@example.invalid`;
const a = await signIn(emailA, studentA);
const b = await signIn(`ai-b-${suffix}@example.invalid`, `B-${suffix}`);
const path = "/api/account/ai";
const aEmpty = await getConfig(a);
const bEmpty = await getConfig(b);
assert.deepEqual(aEmpty.body.config, null);
assert.deepEqual(bEmpty.body.config, null);
assert.notEqual(aEmpty.body.scope, bEmpty.body.scope);

const config = { provider: "deepseek", baseUrl: "https://api.deepseek.com", model: "synthetic-model-a", apiKey: "synthetic-personal-key-a" };
const saved = await api(path, { method: "PUT", cookie: a.cookie, scope: aEmpty.body.scope, body: config });
assert.equal(saved.status, 200);
assert.deepEqual(saved.body.config, { provider: "deepseek", model: config.model, hasKey: true });
const readA = await getConfig(a);
assert.deepEqual(readA.body.config, saved.body.config);
assert.ok(!JSON.stringify(readA.body).includes(config.apiKey));
assert.deepEqual((await getConfig(b)).body.config, null);
assert.equal((await api(path)).status, 401);
assert.equal((await api(path, { method: "DELETE", cookie: b.cookie, scope: aEmpty.body.scope })).status, 409);
assert.equal((await api(path, { method: "PUT", cookie: b.cookie, scope: aEmpty.body.scope, body: config })).status, 409);
assert.equal((await api("/api/ai-test", { method: "POST", cookie: b.cookie, scope: aEmpty.body.scope, body: config })).status, 409);

for (const route of ["explain", "import-ai", "import-answers", "import-english-ai"]) {
  const post = { method: "POST", body: { personalAi: config } };
  assert.equal((await api(`/api/${route}`, post)).status, 401);
  assert.equal((await api(`/api/${route}`, { ...post, cookie: b.cookie, accountId: b.body.user.id })).status, 412);
  assert.equal((await api(`/api/${route}`, { ...post, cookie: b.cookie, accountId: a.body.user.id })).status, 409);
  // An empty request reaches body validation only for a configured account.
  assert.equal((await api(`/api/${route}`, { method: "POST", body: {}, cookie: a.cookie, accountId: a.body.user.id })).status, 400);
}

const idOnly = await api("/api/auth/session", { method: "POST", body: { studentId: studentA, nickname: "Synthetic ID only" } });
assert.equal(idOnly.status, 200);
assert.equal(idOnly.body.user.id, a.body.user.id);
assert.equal((await getConfig(idOnly)).status, 401);
const verify = await api(`${path}/verify`, { method: "POST", cookie: idOnly.cookie, body: { action: "send" } });
assert.equal(verify.status, 200);
const verification = await api(`${path}/verify`, { method: "POST", cookie: idOnly.cookie, body: { action: "verify", code: verify.body.debugCode } });
assert.equal(verification.status, 200);
assert.deepEqual((await getConfig(verification)).body.config, saved.body.config);
assert.equal((await api(`${path}/verify`, { method: "POST", cookie: idOnly.cookie, body: { action: "verify", code: verify.body.debugCode } })).status, 401);

const secondDevice = await signIn(emailA, "");
assert.deepEqual((await getConfig(secondDevice)).body.config, saved.body.config);
const otherEmail = `other-${suffix}@example.invalid`;
const other = await api("/api/auth/email-code", { method: "POST", body: { email: otherEmail } });
assert.equal(other.status, 200);
const rebind = await api("/api/auth/session", { method: "POST", body: { email: otherEmail, studentId: studentA, code: other.body.debugCode } });
assert.equal(rebind.status, 409);
assert.equal(rebind.cookie, undefined);
const saveB = await api(path, { method: "PUT", cookie: b.cookie, scope: bEmpty.body.scope, body: { ...config, model: "synthetic-model-b", apiKey: "synthetic-personal-key-b" } });
assert.equal(saveB.status, 200);
assert.equal((await getConfig(b)).body.config.model, "synthetic-model-b");
assert.equal((await getConfig(a)).body.config.model, "synthetic-model-a");
assert.equal((await api(path, { method: "DELETE", cookie: a.cookie, scope: aEmpty.body.scope })).status, 200);
assert.equal((await getConfig(a)).body.config, null);
assert.equal((await getConfig(b)).body.config.model, "synthetic-model-b");
console.log("Account AI isolation passed: two accounts, guest, ID-only, stale tabs, OTP replay and second device.");
