import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { firstName, requireAdmin } from "./lib/auth";
import { daysBetween, todayUtc } from "./lib/dates";
import { fail } from "./lib/errors";
import { describeEvent } from "./notifications";

// Internal functions behind the signed HTTP endpoints in http.ts. None of
// these are reachable from the browser.

/**
 * Overdue = approved, end date before today (UTC), not returned. Loans that
 * already got a reminder today are excluded, so a re-run of the daily
 * workflow doesn't spam anyone.
 */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(500);

    const result = [];
    for (const loan of loans) {
      const reminderKey = `reminder:${loan._id}:${today}`;
      const done = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", reminderKey))
        .first();
      if (done?.kind === "reminder_sent") continue;

      const [tool, borrower, owner] = await Promise.all([
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.ownerId),
      ]);
      if (!tool || !borrower?.email) continue;
      result.push({
        loanId: loan._id,
        reminderKey,
        toolName: tool.name,
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        borrower: { firstName: firstName(borrower.name), email: borrower.email },
        lender: { firstName: owner ? firstName(owner.name) : "the lender" },
      });
    }
    return { asOf: today, loans: result };
  },
});

/**
 * Idempotent: the key is unique per loan per day. A retried "sent" is a
 * no-op; a "failed" can later be upgraded to "sent" by a successful retry.
 */
export const recordReminder = internalMutation({
  args: {
    loanId: v.id("loans"),
    reminderKey: v.string(),
    outcome: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { loanId, reminderKey, outcome, detail }) => {
    if (!reminderKey.startsWith(`reminder:${loanId}:`)) {
      fail("INVALID_INPUT", "reminderKey does not match loanId");
    }
    const loan = await ctx.db.get(loanId);
    if (!loan) fail("NOT_FOUND", "loan not found");

    const kind = outcome === "sent" ? "reminder_sent" : "reminder_failed";
    const text =
      outcome === "sent"
        ? "Overdue reminder sent to borrower"
        : `Overdue reminder failed${detail ? `: ${detail.slice(0, 120)}` : ""}`;

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", reminderKey))
      .first();
    if (existing) {
      if (existing.kind === "reminder_failed" && kind === "reminder_sent") {
        await ctx.db.patch(existing._id, { kind, detail: text, at: Date.now() });
        return { status: "updated" as const };
      }
      return { status: "duplicate" as const };
    }
    await ctx.db.insert("automationEvents", {
      loanId,
      kind,
      idempotencyKey: reminderKey,
      detail: text,
      at: Date.now(),
    });
    return { status: "recorded" as const };
  },
});

/** n8n confirms a request-status message actually went out. */
export const recordNotificationDelivered = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db
      .query("outbox")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .unique();
    if (!row) fail("NOT_FOUND", "unknown eventId");
    const key = `delivered:${eventId}`;
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
      .first();
    if (existing) return { status: "duplicate" as const };
    await ctx.db.insert("automationEvents", {
      loanId: row.loanId,
      kind: "notification_delivered",
      idempotencyKey: key,
      detail: describeEvent(row.type, "delivered"),
      at: Date.now(),
    });
    return { status: "recorded" as const };
  },
});

export const recordWorkflowError = internalMutation({
  args: {
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowErrors")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .first();
    if (existing) return { status: "duplicate" as const };
    await ctx.db.insert("workflowErrors", {
      executionId: args.executionId.slice(0, 64),
      workflowName: args.workflowName.slice(0, 120),
      nodeName: args.nodeName.slice(0, 120),
      message: args.message.slice(0, 500),
      at: Date.now(),
    });
    return { status: "recorded" as const };
  },
});

/** Admin health panel: recent workflow errors and the outbox backlog. */
export const health = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [errors, pending, failed] = await Promise.all([
      ctx.db.query("workflowErrors").order("desc").take(20),
      ctx.db.query("outbox").withIndex("by_status", (q) => q.eq("status", "pending")).take(50),
      ctx.db.query("outbox").withIndex("by_status", (q) => q.eq("status", "failed")).order("desc").take(20),
    ]);
    return {
      errors: errors.map((e) => ({
        _id: e._id,
        workflowName: e.workflowName,
        nodeName: e.nodeName,
        message: e.message,
        at: e.at,
      })),
      pendingDeliveries: pending.length,
      failedDeliveries: failed.map((f) => ({
        _id: f._id,
        type: f.type,
        attempts: f.attempts,
        lastError: f.lastError ?? null,
        at: f._creationTime,
      })),
    };
  },
});
