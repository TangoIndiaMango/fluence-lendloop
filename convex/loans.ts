import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { firstName, requireAdmin, requireViewer } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { addDays, daysBetween, isValidIsoDate, rangesOverlap, todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./notifications";

// ---------- helpers ----------

async function approvedLoansFor(ctx: QueryCtx, toolId: Id<"tools">) {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}

async function latestActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const [event, pendingOutbox] = await Promise.all([
    ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .first(),
    ctx.db
      .query("outbox")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .first(),
  ]);
  // A delivery still retrying is more current than any past event.
  if (pendingOutbox?.status === "pending" && pendingOutbox.attempts > 0) {
    return {
      kind: "retrying" as const,
      detail: `Notification retrying (attempt ${pendingOutbox.attempts + 1})`,
      at: pendingOutbox._creationTime,
    };
  }
  if (!event) return null;
  return { kind: event.kind, detail: event.detail, at: event.at };
}

/**
 * Shape a loan for the viewer. Contact email of the other party is only
 * revealed once a loan is approved (they need to arrange pick-up); before
 * that, each side sees a first name only.
 */
async function present(ctx: QueryCtx, loan: Doc<"loans">, viewerId: Id<"users"> | null) {
  const [tool, owner, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.ownerId),
    ctx.db.get(loan.borrowerId),
  ]);
  const shareContact = loan.status === "approved";
  const today = todayUtc();
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    message: loan.message ?? null,
    overdue: loan.status === "approved" && loan.endDate < today,
    tool: tool
      ? { _id: tool._id, name: tool.name, category: tool.category, removed: tool.removedAt !== undefined }
      : null,
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
    activity: await latestActivity(ctx, loan._id),
  };
}

async function loadLoanForOwner(ctx: MutationCtx, loanId: Id<"loans">) {
  const viewer = await requireViewer(ctx);
  const loan = await ctx.db.get(loanId);
  // Same error whether it doesn't exist or isn't theirs: don't leak existence.
  if (!loan || loan.ownerId !== viewer._id) throw new ConvexError("Request not found.");
  return { viewer, loan };
}

// ---------- queries ----------

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .order("desc")
      .take(100);
    return await Promise.all(loans.map((l) => present(ctx, l, viewer._id)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .order("desc")
      .take(100);
    return await Promise.all(loans.map((l) => present(ctx, l, viewer._id)));
  },
});

/** Admin only: every loan, with both parties' first names. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(loans.map((l) => present(ctx, l, null)));
  },
});

// ---------- mutations ----------

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("That tool is no longer listed.");
    if (tool.ownerId === viewer._id) throw new ConvexError("You can't borrow your own tool.");

    const { startDate, endDate } = args;
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
      throw new ConvexError("Dates must be valid calendar dates.");
    }
    const today = todayUtc();
    if (startDate < today) throw new ConvexError("The start date can't be in the past.");
    if (endDate < startDate) throw new ConvexError("The end date must be on or after the start date.");
    if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
      throw new ConvexError(`Loans can be at most ${LIMITS.maxLoanDays} days.`);
    }
    if (startDate > addDays(today, LIMITS.maxBookAheadDays)) {
      throw new ConvexError(`You can book at most ${LIMITS.maxBookAheadDays} days ahead.`);
    }

    const message = args.message?.trim() || undefined;
    if (message && message.length > LIMITS.requestMessage) {
      throw new ConvexError(`Message must be at most ${LIMITS.requestMessage} characters.`);
    }

    const clash = (await approvedLoansFor(ctx, tool._id)).find((l) =>
      rangesOverlap(l, { startDate, endDate }),
    );
    if (clash) {
      throw new ConvexError(
        `Already booked ${clash.startDate} to ${clash.endDate}. Pick other dates.`,
      );
    }

    const mine = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .collect();
    const open = mine.filter((l) => l.status === "pending");
    if (open.length >= LIMITS.maxOpenRequestsPerBorrower) {
      throw new ConvexError("You have too many open requests. Wait for some replies first.");
    }
    if (open.some((l) => l.toolId === tool._id && rangesOverlap(l, { startDate, endDate }))) {
      throw new ConvexError("You already have a pending request for these dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: viewer._id,
      startDate,
      endDate,
      message,
      status: "pending",
    });
    await enqueueLoanEvent(ctx, loanId, "request.created");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { loan } = await loadLoanForOwner(ctx, loanId);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be approved.");
    if (loan.endDate < todayUtc()) throw new ConvexError("These dates have already passed.");
    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("That listing was removed.");

    const clash = (await approvedLoansFor(ctx, loan.toolId)).find((l) => rangesOverlap(l, loan));
    if (clash) throw new ConvexError(`Clashes with an approved loan (${clash.startDate} to ${clash.endDate}).`);

    const now = Date.now();
    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await enqueueLoanEvent(ctx, loanId, "request.approved");

    // Other pending requests for overlapping dates can no longer be met.
    const others = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "pending"))
      .collect();
    for (const other of others) {
      if (other._id !== loanId && rangesOverlap(other, loan)) {
        await ctx.db.patch(other._id, { status: "declined", decidedAt: now });
        await enqueueLoanEvent(ctx, other._id, "request.declined", "dates taken by another request");
      }
    }
  },
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { loan } = await loadLoanForOwner(ctx, loanId);
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be declined.");
    await ctx.db.patch(loanId, { status: "declined", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request.declined");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { loan } = await loadLoanForOwner(ctx, loanId);
    if (loan.status !== "approved") throw new ConvexError("Only active loans can be marked returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "loan.returned");
  },
});

/** Borrower withdraws their own pending request. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const viewer = await requireViewer(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan || loan.borrowerId !== viewer._id) throw new ConvexError("Request not found.");
    if (loan.status !== "pending") throw new ConvexError("Only pending requests can be cancelled.");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request.cancelled");
  },
});
