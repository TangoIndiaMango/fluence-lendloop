import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LIMITS } from "../../convex/lib/constants";
import { day, expectCode, setup } from "./setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Ada lends a drill, Bayo wants to borrow it. */
async function scene() {
  const s = setup();
  const people = await s.cast();
  const toolId = await s.listTool(people.ada);
  const ask = (startDate = day(1), endDate = day(3)) =>
    people.bayo.mutation(api.loans.request, { toolId, startDate, endDate });
  const loan = (id: Id<"loans">) => s.t.run((ctx) => ctx.db.get(id));
  return { ...s, ...people, toolId, ask, loan };
}

describe("loans.request", () => {
  test("creates a pending loan and queues a note to the lender", async () => {
    const { t, ask, loan } = await scene();
    const loanId = await ask();
    expect(await loan(loanId)).toMatchObject({ status: "pending", startDate: day(1), endDate: day(3) });

    const [row] = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(row).toMatchObject({ type: "request.created", status: "pending" });
    const payload = JSON.parse(row.payload);
    // Data minimisation: first names and the recipient's email only.
    expect(payload.recipient).toEqual({ firstName: "Ada", email: "ada@test.local" });
    expect(payload.counterpart).toEqual({ firstName: "Bayo" });
    expect(row.payload).not.toContain("bayo@test.local");
  });

  test("rejects borrowing your own tool", async () => {
    const { ada, toolId } = await scene();
    await expectCode(ada.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) }), "FORBIDDEN");
  });

  test.each([
    ["a start date in the past", day(-1), day(1)],
    ["an end date before the start", day(3), day(2)],
    ["an impossible date", "2026-02-30", day(2)],
    ["a loan longer than the limit", day(1), day(LIMITS.maxLoanDays + 1)],
    ["a start too far ahead", day(LIMITS.maxBookAheadDays + 1), day(LIMITS.maxBookAheadDays + 2)],
  ])("rejects %s", async (_, start, end) => {
    const { ask } = await scene();
    await expectCode(ask(start, end), "INVALID_INPUT");
  });

  test("rejects dates that clash with an approved loan, inclusive of the end day", async () => {
    const { ada, signIn, toolId, ask } = await scene();
    await ada.mutation(api.loans.approve, { loanId: await ask(day(1), day(3)) });
    const chi = await signIn("chi", { name: "Chioma Eze", email: "chi@test.local" });
    await expectCode(chi.mutation(api.loans.request, { toolId, startDate: day(3), endDate: day(4) }), "CONFLICT");
    await chi.mutation(api.loans.request, { toolId, startDate: day(4), endDate: day(5) });
  });

  test("rejects a second pending request for overlapping dates", async () => {
    const { ask } = await scene();
    await ask(day(1), day(3));
    await expectCode(ask(day(2), day(4)), "CONFLICT");
  });

  test("rejects a removed tool", async () => {
    const { ada, toolId, ask } = await scene();
    await ada.mutation(api.tools.remove, { toolId });
    await expectCode(ask(), "NOT_FOUND");
  });
});

describe("approve, decline, return, cancel", () => {
  test("only the owner can decide; others get NOT_FOUND so ids can't be probed", async () => {
    const { bayo, admin, ask } = await scene();
    const loanId = await ask();
    await expectCode(bayo.mutation(api.loans.approve, { loanId }), "NOT_FOUND");
    await expectCode(admin.mutation(api.loans.approve, { loanId }), "NOT_FOUND");
    await expectCode(bayo.mutation(api.loans.decline, { loanId }), "NOT_FOUND");
  });

  test("approving auto-declines other pending requests for overlapping dates", async () => {
    const { ada, signIn, toolId, ask, loan } = await scene();
    const chi = await signIn("chi", { name: "Chioma Eze", email: "chi@test.local" });
    const mine = await ask(day(1), day(3));
    const overlapping = await chi.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(4) });
    const later = await chi.mutation(api.loans.request, { toolId, startDate: day(10), endDate: day(11) });

    await ada.mutation(api.loans.approve, { loanId: mine });
    expect((await loan(mine))?.status).toBe("approved");
    expect((await loan(overlapping))?.status).toBe("declined");
    expect((await loan(later))?.status).toBe("pending");
  });

  test("status rules: only pending can be decided, only approved can be returned", async () => {
    const { ada, ask, loan } = await scene();
    const loanId = await ask();
    await expectCode(ada.mutation(api.loans.markReturned, { loanId }), "INVALID_STATE");
    await ada.mutation(api.loans.approve, { loanId });
    await expectCode(ada.mutation(api.loans.decline, { loanId }), "INVALID_STATE");
    await ada.mutation(api.loans.markReturned, { loanId });
    expect((await loan(loanId))?.status).toBe("returned");
  });

  test("a request whose dates have passed can't be approved", async () => {
    const { ada, ask } = await scene();
    const loanId = await ask(day(0), day(0));
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);
    await expectCode(ada.mutation(api.loans.approve, { loanId }), "INVALID_STATE");
  });

  test("only the borrower can withdraw, and only while pending", async () => {
    const { ada, bayo, ask, loan } = await scene();
    const loanId = await ask();
    await expectCode(ada.mutation(api.loans.cancel, { loanId }), "NOT_FOUND");
    await bayo.mutation(api.loans.cancel, { loanId });
    expect((await loan(loanId))?.status).toBe("cancelled");
    await expectCode(bayo.mutation(api.loans.cancel, { loanId }), "INVALID_STATE");
  });
});

describe("loan views", () => {
  test("emails are shared only once a loan is approved, and only with the other party", async () => {
    const { ada, bayo, ask } = await scene();
    const loanId = await ask();
    const [pendingView] = await ada.query(api.loans.incoming, {});
    expect(pendingView.borrower).toEqual({ firstName: "Bayo", email: null });

    await ada.mutation(api.loans.approve, { loanId });
    const [ownerView] = await ada.query(api.loans.incoming, {});
    const [borrowerView] = await bayo.query(api.loans.myRequests, {});
    expect(ownerView.borrower?.email).toBe("bayo@test.local");
    expect(ownerView.owner?.email).toBeNull();
    expect(borrowerView.owner?.email).toBe("ada@test.local");
  });

  test("flags an approved loan as overdue after its end date", async () => {
    const { ada, ask } = await scene();
    await ada.mutation(api.loans.approve, { loanId: await ask(day(0), day(1)) });
    vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000);
    const [view] = await ada.query(api.loans.incoming, {});
    expect(view.overdue).toBe(true);
  });

  test("only admins see every loan, with no emails", async () => {
    const { bayo, admin, ada, ask } = await scene();
    await ada.mutation(api.loans.approve, { loanId: await ask() });
    await expectCode(bayo.query(api.loans.all, {}), "FORBIDDEN");
    const [view] = await admin.query(api.loans.all, {});
    expect(view.owner?.email).toBeNull();
    expect(view.borrower?.email).toBeNull();
  });

  test("a recipient with no email is marked skipped and shown on the loan", async () => {
    const { t, signIn, toolId } = await scene();
    // Ada has an email; give the tool to someone without one.
    const noEmail = await signIn("nomail", { name: "Dele Musa" });
    await t.run((ctx) => ctx.db.patch(toolId, { ownerId: noEmail.id }));
    const chi = await signIn("chi", { name: "Chioma Eze", email: "chi@test.local" });
    await chi.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });

    const [row] = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(row.status).toBe("skipped");
    const [view] = await noEmail.query(api.loans.incoming, {});
    expect(view.activity).toMatchObject({ kind: "skipped", detail: "Not emailed: no email address on file" });
  });
});
