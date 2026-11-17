import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signBody, verifySignature } from "../../convex/lib/hmac";
import { day, setup } from "./setup";

// The endpoints n8n calls. Every request must be signed with the n8n→Convex
// secret, and replies that carry data are signed with the Convex→n8n secret.

const IN_SECRET = "n8n-to-convex-test-secret";
const OUT_SECRET = "convex-to-n8n-test-secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("HMAC_SECRET_N8N_TO_CONVEX", IN_SECRET);
  vi.stubEnv("HMAC_SECRET_CONVEX_TO_N8N", OUT_SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function signedPost(t: ReturnType<typeof setup>["t"], path: string, body: unknown, secret = IN_SECRET) {
  const raw = JSON.stringify(body);
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await signBody(secret, raw)) },
    body: raw,
  });
}

describe("signed automation endpoints", () => {
  test("reject a missing or wrong signature with a bare 401", async () => {
    const { t } = setup();
    const unsigned = await t.fetch("/automation/overdue-loans", { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toEqual({ error: "invalid signature" });

    const wrongKey = await signedPost(t, "/automation/overdue-loans", {}, "guessed-secret");
    expect(wrongKey.status).toBe(401);
  });

  test("reject a tampered body", async () => {
    const { t } = setup();
    const headers = await signBody(IN_SECRET, JSON.stringify({ eventId: "a" }));
    const res = await t.fetch("/automation/notification-status", {
      method: "POST",
      headers,
      body: JSON.stringify({ eventId: "b" }),
    });
    expect(res.status).toBe(401);
  });

  test("reject a replayed request older than five minutes", async () => {
    const { t } = setup();
    const raw = "{}";
    const headers = await signBody(IN_SECRET, raw);
    vi.advanceTimersByTime(6 * 60 * 1000);
    const res = await t.fetch("/automation/overdue-loans", { method: "POST", headers, body: raw });
    expect(res.status).toBe(401);
  });

  test("return 503 when the secrets aren't configured", async () => {
    const { t } = setup();
    vi.stubEnv("HMAC_SECRET_N8N_TO_CONVEX", "");
    const res = await signedPost(t, "/automation/overdue-loans", {});
    expect(res.status).toBe(503);
  });

  test("return the overdue list with a reply n8n can verify", async () => {
    const { t, cast, listTool } = setup();
    const { ada, bayo } = await cast();
    const toolId = await listTool(ada);
    const loanId = await bayo.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(0) });
    await ada.mutation(api.loans.approve, { loanId });
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);

    const res = await signedPost(t, "/automation/overdue-loans", {});
    expect(res.status).toBe(200);
    const raw = await res.text();
    const check = await verifySignature(
      OUT_SECRET,
      raw,
      res.headers.get(TIMESTAMP_HEADER),
      res.headers.get(SIGNATURE_HEADER),
    );
    expect(check).toEqual({ ok: true });
    expect(JSON.parse(raw).loans).toHaveLength(1);
  });

  test("answer 400, not 500, to a validly signed but malformed write-back, so n8n won't retry it", async () => {
    const { t } = setup();
    const res = await signedPost(t, "/automation/reminder-status", { loanId: "nope", reminderKey: "x", outcome: "sent" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid request" });
  });

  test("record a reminder write-back once, however often n8n retries", async () => {
    const { t, cast, listTool } = setup();
    const { ada, bayo } = await cast();
    const toolId = await listTool(ada);
    const loanId = await bayo.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(0) });
    await ada.mutation(api.loans.approve, { loanId });
    const body = { loanId, reminderKey: `reminder:${loanId}:${day(0)}`, outcome: "sent" };

    const first = await signedPost(t, "/automation/reminder-status", body);
    const retry = await signedPost(t, "/automation/reminder-status", body);
    expect(await first.json()).toEqual({ status: "recorded" });
    expect(await retry.json()).toEqual({ status: "duplicate" });
  });

  test("refuse bodies over 16 KB", async () => {
    const { t } = setup();
    const res = await signedPost(t, "/automation/workflow-error", { message: "x".repeat(17 * 1024) });
    expect(res.status).toBe(413);
  });
});
