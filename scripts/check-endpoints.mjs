// Smoke-tests the signed Convex HTTP endpoints the way n8n calls them.
//   node --env-file=.env --env-file=.env.local scripts/check-endpoints.mjs
// Checks: unsigned/forged/stale calls are rejected, a signed call works and
// its response signature verifies, and a repeated write-back is a no-op.
import { createHmac } from "node:crypto";

const site = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "").replace(/\/$/, "");
const inSecret = process.env.HMAC_SECRET_N8N_TO_CONVEX;
const outSecret = process.env.HMAC_SECRET_CONVEX_TO_N8N;
if (!site || !inSecret || !outSecret) {
  console.error("Need NEXT_PUBLIC_CONVEX_SITE_URL and both HMAC secrets in the environment.");
  process.exit(1);
}

const hmac = (secret, ts, body) => "sha256=" + createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
const now = () => Math.floor(Date.now() / 1000);

async function call(path, payload, { secret = inSecret, ts = now(), sign = true } = {}) {
  const body = JSON.stringify(payload);
  const headers = { "content-type": "application/json" };
  if (sign) {
    headers["x-lendloop-timestamp"] = String(ts);
    headers["x-lendloop-signature"] = hmac(secret, ts, body);
  }
  const res = await fetch(`${site}${path}`, { method: "POST", headers, body });
  return { res, text: await res.text() };
}

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failures++;
};

const overdue = "/automation/overdue-loans";
check("unsigned request rejected", (await call(overdue, {}, { sign: false })).res.status === 401);
check("wrong secret rejected", (await call(overdue, {}, { secret: "not-the-secret" })).res.status === 401);
check("stale timestamp rejected", (await call(overdue, {}, { ts: now() - 3600 })).res.status === 401);

const { res, text } = await call(overdue, { requestedAt: new Date().toISOString() });
check("signed request accepted", res.status === 200, `HTTP ${res.status}`);
const ts = res.headers.get("x-lendloop-timestamp");
check("response signature verifies", res.headers.get("x-lendloop-signature") === hmac(outSecret, ts, text));
const { loans = [] } = JSON.parse(text);
console.log(`      ${loans.length} overdue loan(s) not yet reminded today`);

const bad = await call("/automation/reminder-status", { loanId: "nope", reminderKey: "x", outcome: "sent" });
check("malformed write-back is a 400 (not retried forever)", bad.res.status === 400, `HTTP ${bad.res.status}`);

if (loans[0]) {
  const payload = { loanId: loans[0].loanId, reminderKey: loans[0].reminderKey, outcome: "failed", detail: "smoke test" };
  const first = JSON.parse((await call("/automation/reminder-status", payload)).text);
  const again = JSON.parse((await call("/automation/reminder-status", payload)).text);
  check("write-back recorded once, retry is a duplicate", first.status === "recorded" && again.status === "duplicate",
    `${first.status} then ${again.status}`);
}

process.exit(failures ? 1 : 0);
