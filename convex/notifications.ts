import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { firstName } from "./lib/auth";
import { signBody } from "./lib/hmac";
import type { Infer } from "convex/values";
import type { loanEventType } from "./schema";

type LoanEventType = Infer<typeof loanEventType>;

const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

// Who hears about each event. Owners learn about new/cancelled requests;
// borrowers learn about decisions and returns.
const RECIPIENT: Record<LoanEventType, "owner" | "borrower"> = {
  "request.created": "owner",
  "request.cancelled": "owner",
  "request.approved": "borrower",
  "request.declined": "borrower",
  "loan.returned": "borrower",
};

/**
 * Write an outbox row in the same transaction as the state change, then
 * schedule delivery. If the mutation rolls back, no webhook is ever sent;
 * if it commits, delivery is guaranteed to be attempted.
 *
 * The payload is deliberately small: first names, the tool name, dates and
 * the one email address n8n needs to send the message. No ids of users,
 * no descriptions, no other party's email.
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  type: LoanEventType,
  reason?: string,
) {
  const loan = await ctx.db.get(loanId);
  if (!loan) return;
  const [tool, owner, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
  ]);
  if (!tool || !owner || !borrower) return;

  const to = RECIPIENT[type] === "owner" ? owner : borrower;
  const other = RECIPIENT[type] === "owner" ? borrower : owner;
  const eventId = crypto.randomUUID();

  const payload = JSON.stringify({
    eventId,
    type,
    occurredAt: new Date().toISOString(),
    loan: {
      id: loan._id,
      status: loan.status,
      startDate: loan.startDate,
      endDate: loan.endDate,
    },
    tool: { name: tool.name },
    recipient: { firstName: firstName(to.name), email: to.email ?? null },
    counterpart: { firstName: firstName(other.name) },
    ...(reason ? { reason } : {}),
  });

  const outboxId = await ctx.db.insert("outbox", {
    eventId,
    loanId,
    type,
    payload,
    status: to.email ? "pending" : "skipped",
    attempts: 0,
    ...(to.email ? {} : { lastError: "recipient has no email address" }),
  });
  if (to.email) {
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { outboxId });
  }
}

export const getOutbox = internalQuery({
  args: { outboxId: v.id("outbox") },
  handler: (ctx, { outboxId }) => ctx.db.get(outboxId),
});

export const recordAttempt = internalMutation({
  args: {
    outboxId: v.id("outbox"),
    ok: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { outboxId, ok, error }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status !== "pending") return { retryInMs: null };
    const attempts = row.attempts + 1;
    const now = Date.now();

    if (ok) {
      await ctx.db.patch(outboxId, { status: "sent", attempts, lastError: undefined });
      await ctx.db.insert("automationEvents", {
        loanId: row.loanId,
        kind: "notification_handed_off",
        idempotencyKey: `handoff:${row.eventId}`,
        detail: describeEvent(row.type, "queued"),
        at: now,
      });
      return { retryInMs: null };
    }

    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(outboxId, { status: "failed", attempts, lastError: error });
      await ctx.db.insert("automationEvents", {
        loanId: row.loanId,
        kind: "notification_failed",
        idempotencyKey: `failed:${row.eventId}`,
        detail: `Notification failed after ${attempts} attempts`,
        at: now,
      });
      return { retryInMs: null };
    }

    await ctx.db.patch(outboxId, { attempts, lastError: error });
    // Exponential backoff with jitter: ~10s, 20s, 40s, 80s.
    const base = 5_000 * 2 ** attempts;
    return { retryInMs: base + Math.floor(Math.random() * 1_000) };
  },
});

/** Sends one outbox row to the n8n webhook, signed with HMAC. */
export const deliver = internalAction({
  args: { outboxId: v.id("outbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.runQuery(internal.notifications.getOutbox, { outboxId });
    if (!row || row.status !== "pending") return;

    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.HMAC_SECRET_CONVEX_TO_N8N;
    let ok = false;
    let error: string | undefined;

    if (!url || !secret) {
      error = "N8N_REQUEST_WEBHOOK_URL or HMAC_SECRET_CONVEX_TO_N8N is not set";
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-lendloop-event-id": row.eventId,
            ...(await signBody(secret, row.payload)),
          },
          body: row.payload,
          signal: controller.signal,
        });
        ok = res.ok;
        if (!ok) error = `n8n responded ${res.status}`;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        clearTimeout(timer);
      }
    }

    const { retryInMs } = await ctx.runMutation(internal.notifications.recordAttempt, {
      outboxId,
      ok,
      error: error?.slice(0, 300),
    });
    if (retryInMs !== null) {
      await ctx.scheduler.runAfter(retryInMs, internal.notifications.deliver, { outboxId });
    }
  },
});

export function describeEvent(type: LoanEventType, phase: "queued" | "delivered"): string {
  const who = RECIPIENT[type] === "owner" ? "Lender" : "Borrower";
  const what: Record<LoanEventType, string> = {
    "request.created": "new request",
    "request.cancelled": "cancellation",
    "request.approved": "approval",
    "request.declined": "decline",
    "loan.returned": "return",
  };
  return phase === "queued"
    ? `${who} notification queued (${what[type]})`
    : `${who} notified of ${what[type]}`;
}
