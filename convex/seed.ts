import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { addDays, todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./notifications";

/**
 * Demo data for local review. Internal only (CLI/dashboard):
 *   npx convex run seed:demo
 * Creates three neighbours (emails go to Mailpit), a handful of tools, one
 * pending request (fires a notification) and one overdue loan (picked up by
 * the daily reminder workflow). Safe to re-run: it does nothing twice.
 */
export const demo = internalMutation({
  args: { notify: v.optional(v.boolean()) },
  handler: async (ctx, { notify = true }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", "demo|ada"))
      .unique();
    if (existing) return "Demo data already present.";

    const person = (key: string, name: string) =>
      ctx.db.insert("users", {
        tokenIdentifier: `demo|${key}`,
        name,
        email: `${key}@lendloop.local`,
        role: "user",
        trustedLender: false,
      });
    const ada = await person("ada", "Ada Okafor");
    const bayo = await person("bayo", "Bayo Adeyemi");
    const chi = await person("chi", "Chioma Eze");
    await ctx.db.patch(ada, { trustedLender: true });

    const tool = (
      ownerId: Id<"users">,
      name: string,
      category: Doc<"tools">["category"],
      condition: Doc<"tools">["condition"],
      description: string,
    ) => ctx.db.insert("tools", { ownerId, name, category, condition, description, updatedAt: Date.now() });
    const drill = await tool(ada, "Cordless drill (18V)", "Power tools", "good", "Two batteries and a charger. Please return charged.");
    const ladder = await tool(ada, "Extension ladder, 5m", "Ladders & access", "fair", "Heavy; you'll need a car.");
    await tool(bayo, "Hedge trimmer", "Garden", "good", "Electric, 15m cable.");
    await tool(bayo, "Camping stove", "Camping & outdoors", "new", "Gas canister not included.");
    await tool(chi, "Pressure washer", "Cleaning", "good", "Great for patios.");

    const today = todayUtc();
    // Overdue: approved loan that ended 2 days ago and was never returned.
    await ctx.db.insert("loans", {
      toolId: ladder,
      ownerId: ada,
      borrowerId: chi,
      startDate: addDays(today, -6),
      endDate: addDays(today, -2),
      status: "approved",
      decidedAt: Date.now(),
    });
    // Pending request: notifies Ada through the n8n webhook.
    const pending = await ctx.db.insert("loans", {
      toolId: drill,
      ownerId: ada,
      borrowerId: bayo,
      startDate: addDays(today, 1),
      endDate: addDays(today, 3),
      message: "Putting up shelves this weekend.",
      status: "pending",
    });
    if (notify) await enqueueLoanEvent(ctx, pending, "request.created");
    return "Seeded 3 neighbours, 5 tools, 1 pending request and 1 overdue loan.";
  },
});
