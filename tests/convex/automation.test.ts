import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { todayUtc } from "../../convex/lib/dates";
import { day, expectCode, setup } from "./setup";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** An approved loan that ended `daysOverdue` days ago. */
async function overdueScene(daysOverdue = 2) {
  const s = setup();
  const people = await s.cast();
  const toolId = await s.listTool(people.ada, "Extension ladder");
  const loanId = await people.bayo.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(0) });
  await people.ada.mutation(api.loans.approve, { loanId });
  vi.advanceTimersByTime(daysOverdue * DAY_MS);
  return { ...s, ...people, toolId, loanId };
}

describe("automation.overdueLoans", () => {
  test("lists overdue loans with only what the reminder needs", async () => {
    const { t, loanId } = await overdueScene(2);
    const { asOf, loans } = await t.query(internal.automation.overdueLoans, {});
    expect(asOf).toBe(todayUtc());
    expect(loans).toEqual([
      {
        loanId,
        reminderKey: `reminder:${loanId}:${todayUtc()}`,
        toolName: "Extension ladder",
        endDate: expect.any(String),
        daysOverdue: 2,
        borrower: { firstName: "Bayo", email: "bayo@test.local" },
        lender: { firstName: "Ada" },
      },
    ]);
  });

  test("ignores loans that are returned or not yet due", async () => {
    const { t, ada, loanId } = await overdueScene(0);
    expect((await t.query(internal.automation.overdueLoans, {})).loans).toEqual([]);
    vi.advanceTimersByTime(DAY_MS);
    await ada.mutation(api.loans.markReturned, { loanId });
    expect((await t.query(internal.automation.overdueLoans, {})).loans).toEqual([]);
  });

  test("skips a loan already reminded today, but lists it again tomorrow", async () => {
    const { t, loanId } = await overdueScene();
    const [first] = (await t.query(internal.automation.overdueLoans, {})).loans;
    await t.mutation(internal.automation.recordReminder, { loanId, reminderKey: first.reminderKey, outcome: "sent" });
    expect((await t.query(internal.automation.overdueLoans, {})).loans).toEqual([]);
    vi.advanceTimersByTime(DAY_MS);
    expect((await t.query(internal.automation.overdueLoans, {})).loans).toHaveLength(1);
  });
});

describe("automation.recordReminder", () => {
  test("is idempotent: a retried write-back never duplicates", async () => {
    const { t, loanId } = await overdueScene();
    const reminderKey = `reminder:${loanId}:${todayUtc()}`;
    const record = (outcome: "sent" | "failed") =>
      t.mutation(internal.automation.recordReminder, { loanId, reminderKey, outcome, detail: "smtp down" });

    expect(await record("failed")).toEqual({ status: "recorded" });
    expect(await record("failed")).toEqual({ status: "duplicate" });
    expect(await record("sent")).toEqual({ status: "updated" }); // a later retry worked
    expect(await record("sent")).toEqual({ status: "duplicate" });
    expect(await record("failed")).toEqual({ status: "duplicate" }); // never downgrades

    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    const reminders = events.filter((e) => e.idempotencyKey === reminderKey);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ kind: "reminder_sent", detail: "Overdue reminder sent to borrower" });
  });

  test("rejects a key that belongs to another loan", async () => {
    const { t, loanId } = await overdueScene();
    await expectCode(
      t.mutation(internal.automation.recordReminder, { loanId, reminderKey: "reminder:someone-else:2026-01-01", outcome: "sent" }),
      "INVALID_INPUT",
    );
  });

  test("shows up as the loan's activity line", async () => {
    const { t, ada, loanId } = await overdueScene();
    await t.mutation(internal.automation.recordReminder, {
      loanId,
      reminderKey: `reminder:${loanId}:${todayUtc()}`,
      outcome: "sent",
    });
    const [view] = await ada.query(api.loans.incoming, {});
    expect(view.activity).toMatchObject({ kind: "reminder_sent", detail: "Overdue reminder sent to borrower" });
  });
});

describe("delivery receipts and workflow errors", () => {
  test("recordNotificationDelivered is idempotent and rejects unknown events", async () => {
    const { t, cast, listTool } = setup();
    const { ada, bayo } = await cast();
    const toolId = await listTool(ada);
    await bayo.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    const [row] = await t.run((ctx) => ctx.db.query("outbox").collect());

    const deliver = (eventId: string) => t.mutation(internal.automation.recordNotificationDelivered, { eventId });
    expect(await deliver(row.eventId)).toEqual({ status: "recorded" });
    expect(await deliver(row.eventId)).toEqual({ status: "duplicate" });
    await expectCode(deliver("not-a-real-event"), "NOT_FOUND");
    const [view] = await ada.query(api.loans.incoming, {});
    expect(view.activity?.detail).toBe("Lender notified of new request");
  });

  test("workflow errors are deduplicated and only admins can read them", async () => {
    const { t, cast } = setup();
    const { bayo, admin } = await cast();
    const error = { executionId: "42", workflowName: "Daily overdue reminders", nodeName: "Send", message: "boom" };
    expect(await t.mutation(internal.automation.recordWorkflowError, error)).toEqual({ status: "recorded" });
    expect(await t.mutation(internal.automation.recordWorkflowError, error)).toEqual({ status: "duplicate" });

    await expectCode(bayo.query(api.automation.health, {}), "FORBIDDEN");
    const health = await admin.query(api.automation.health, {});
    expect(health.errors).toHaveLength(1);
    expect(health.errors[0]).toMatchObject({ workflowName: "Daily overdue reminders", message: "boom" });
  });
});

describe("notification delivery to n8n", () => {
  async function queued() {
    const s = setup();
    const { ada, bayo } = await s.cast();
    const toolId = await s.listTool(ada);
    await bayo.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    const outbox = () => s.t.run(async (ctx) => (await ctx.db.query("outbox").collect())[0]);
    return { ...s, outbox };
  }

  test("signs the payload and marks the row sent when n8n accepts it", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook");
    vi.stubEnv("HMAC_SECRET_CONVEX_TO_N8N", "out-secret");
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, outbox } = await queued();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await outbox()).toMatchObject({ status: "sent", attempts: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe("https://n8n.test/webhook");
    expect(headers["x-lendloop-signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(init.body).toBe((await outbox()).payload);
  });

  test("retries with backoff, then gives up and records the failure", async () => {
    vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", "https://n8n.test/webhook");
    vi.stubEnv("HMAC_SECRET_CONVEX_TO_N8N", "out-secret");
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, outbox } = await queued();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(await outbox()).toMatchObject({ status: "failed", attempts: 5, lastError: "n8n responded 503" });
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.map((e) => e.kind)).toEqual(["notification_failed"]);
  });
});
