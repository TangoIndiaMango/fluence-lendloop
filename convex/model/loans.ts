import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { firstName, requireViewer } from "../lib/auth";
import { LIMITS, type LoanStatus } from "../lib/constants";
import { addDays, daysBetween, isValidIsoDate, rangesOverlap, todayUtc } from "../lib/dates";
import { fail } from "../lib/errors";

// Loan business rules, shared by the public functions in convex/loans.ts and
// by tools.ts. Plain functions that take ctx: easy to read, reuse and test.

type DateRange = { startDate: string; endDate: string };

export async function loansForTool(ctx: QueryCtx, toolId: Id<"tools">, status: LoanStatus) {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", status))
    .collect();
}

/** Throws INVALID_INPUT unless the range is a bookable loan period. */
export function assertBookableRange({ startDate, endDate }: DateRange, today = todayUtc()) {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    fail("INVALID_INPUT", "Dates must be valid calendar dates.");
  }
  if (startDate < today) fail("INVALID_INPUT", "The start date can't be in the past.");
  if (endDate < startDate) fail("INVALID_INPUT", "The end date must be on or after the start date.");
  if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
    fail("INVALID_INPUT", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
  }
  if (startDate > addDays(today, LIMITS.maxBookAheadDays)) {
    fail("INVALID_INPUT", `You can book at most ${LIMITS.maxBookAheadDays} days ahead.`);
  }
}

/** Throws CONFLICT if the range overlaps an approved loan of this tool. */
export async function assertNoApprovedClash(ctx: QueryCtx, toolId: Id<"tools">, range: DateRange) {
  const clash = (await loansForTool(ctx, toolId, "approved")).find((l) => rangesOverlap(l, range));
  if (clash) {
    fail("CONFLICT", `Already booked ${clash.startDate} to ${clash.endDate}. Pick other dates.`);
  }
}

/**
 * Load a loan the viewer is a party to, in the given role. "Not found" and
 * "not yours" give the same error so ids can't be probed.
 */
export async function loadLoanAs(ctx: MutationCtx, loanId: Id<"loans">, role: "owner" | "borrower") {
  const viewer = await requireViewer(ctx);
  const loan = await ctx.db.get(loanId);
  const partyId = role === "owner" ? loan?.ownerId : loan?.borrowerId;
  if (!loan || partyId !== viewer._id) fail("NOT_FOUND", "Request not found.");
  return { viewer, loan };
}

/** Throws INVALID_STATE unless the loan is in the status the action needs. */
export function assertStatus(loan: Doc<"loans">, expected: LoanStatus, message: string) {
  if (loan.status !== expected) fail("INVALID_STATE", message);
}

/** The newest automation fact about a loan, for the activity line. */
async function latestActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const [event, outbox] = await Promise.all([
    ctx.db.query("automationEvents").withIndex("by_loan", (q) => q.eq("loanId", loanId)).order("desc").first(),
    ctx.db.query("outbox").withIndex("by_loan", (q) => q.eq("loanId", loanId)).order("desc").first(),
  ]);
  // The newest outbox row describes the latest state change; it wins when
  // it is still in flight or never reached n8n at all.
  if (outbox?.status === "pending" && outbox.attempts > 0) {
    return { kind: "retrying" as const, detail: `Notification retrying (attempt ${outbox.attempts + 1})`, at: outbox._creationTime };
  }
  if (outbox?.status === "skipped" && (!event || event.at < outbox._creationTime)) {
    return { kind: "skipped" as const, detail: "Not emailed: no email address on file", at: outbox._creationTime };
  }
  if (!event) return null;
  return { kind: event.kind, detail: event.detail, at: event.at };
}

/**
 * Shape a loan for the viewer. The other party's email is revealed only
 * once a loan is approved (to arrange pick-up); until then, first names only.
 */
export async function presentLoan(ctx: QueryCtx, loan: Doc<"loans">, viewerId: Id<"users"> | null) {
  const [tool, owner, borrower, activity] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
    latestActivity(ctx, loan._id),
  ]);
  const shareContact = loan.status === "approved";
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    message: loan.message ?? null,
    overdue: loan.status === "approved" && loan.endDate < todayUtc(),
    tool: tool ? { _id: tool._id, name: tool.name, category: tool.category, removed: tool.removedAt !== undefined } : null,
    owner: owner
      ? {
          firstName: firstName(owner.name),
          trusted: owner.trustedLender,
          email: shareContact && viewerId === loan.borrowerId ? (owner.email ?? null) : null,
        }
      : null,
    borrower: borrower
      ? {
          firstName: firstName(borrower.name),
          email: shareContact && viewerId === loan.ownerId ? (borrower.email ?? null) : null,
        }
      : null,
    activity,
  };
}
