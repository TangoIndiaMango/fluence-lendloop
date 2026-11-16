import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireViewer } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { rangesOverlap, todayUtc } from "./lib/dates";
import { fail } from "./lib/errors";
import {
  assertBookableRange,
  assertNoApprovedClash,
  assertStatus,
  loadLoanAs,
  loansForTool,
  presentLoan,
} from "./model/loans";
import { enqueueLoanEvent } from "./notifications";

// Public loan API. Business rules live in ./model/loans; each function here
// is: authorise, check, change, notify.

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
    return await Promise.all(loans.map((l) => presentLoan(ctx, l, viewer._id)));
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
    return await Promise.all(loans.map((l) => presentLoan(ctx, l, viewer._id)));
  },
});

/** Admin only: every loan, with both parties' first names. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(loans.map((l) => presentLoan(ctx, l, null)));
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
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "That tool is no longer listed.");
    if (tool.ownerId === viewer._id) fail("FORBIDDEN", "You can't borrow your own tool.");

    const range = { startDate: args.startDate, endDate: args.endDate };
    assertBookableRange(range);
    const message = args.message?.trim() || undefined;
    if (message && message.length > LIMITS.requestMessage) {
      fail("INVALID_INPUT", `Message must be at most ${LIMITS.requestMessage} characters.`);
    }
    await assertNoApprovedClash(ctx, tool._id, range);

    const open = (
      await ctx.db
        .query("loans")
        .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
        .collect()
    ).filter((l) => l.status === "pending");
    if (open.length >= LIMITS.maxOpenRequestsPerBorrower) {
      fail("LIMIT_REACHED", "You have too many open requests. Wait for some replies first.");
    }
    if (open.some((l) => l.toolId === tool._id && rangesOverlap(l, range))) {
      fail("CONFLICT", "You already have a pending request for these dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: viewer._id,
      ...range,
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
    const { loan } = await loadLoanAs(ctx, loanId, "owner");
    assertStatus(loan, "pending", "Only pending requests can be approved.");
    if (loan.endDate < todayUtc()) fail("INVALID_STATE", "These dates have already passed.");
    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "That listing was removed.");
    await assertNoApprovedClash(ctx, loan.toolId, loan);

    const now = Date.now();
    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await enqueueLoanEvent(ctx, loanId, "request.approved");

    // Other pending requests for overlapping dates can no longer be met.
    for (const other of await loansForTool(ctx, loan.toolId, "pending")) {
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
    const { loan } = await loadLoanAs(ctx, loanId, "owner");
    assertStatus(loan, "pending", "Only pending requests can be declined.");
    await ctx.db.patch(loanId, { status: "declined", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request.declined");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { loan } = await loadLoanAs(ctx, loanId, "owner");
    assertStatus(loan, "approved", "Only active loans can be marked returned.");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "loan.returned");
  },
});

/** Borrower withdraws their own pending request. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const { loan } = await loadLoanAs(ctx, loanId, "borrower");
    assertStatus(loan, "pending", "Only pending requests can be withdrawn.");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request.cancelled");
  },
});
