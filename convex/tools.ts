import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { firstName, isAdmin, requireViewer } from "./lib/auth";
import { LIMITS } from "./lib/constants";
import { todayUtc } from "./lib/dates";
import { enqueueLoanEvent } from "./notifications";
import { category, condition } from "./schema";

type Availability =
  | { state: "available"; nextBookedFrom: string | null }
  | { state: "on_loan"; until: string; overdue: boolean };

async function availabilityOf(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  today: string,
): Promise<Availability> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  const current = approved.find((l) => l.startDate <= today);
  if (current) {
    return { state: "on_loan", until: current.endDate, overdue: current.endDate < today };
  }
  const upcoming = approved.map((l) => l.startDate).sort()[0] ?? null;
  return { state: "available", nextBookedFrom: upcoming };
}

async function activeTools(ctx: QueryCtx, cat?: Doc<"tools">["category"]) {
  return await ctx.db
    .query("tools")
    .withIndex("by_removed_category", (q) =>
      cat ? q.eq("removedAt", undefined).eq("category", cat) : q.eq("removedAt", undefined),
    )
    .order("desc")
    .take(200);
}

/**
 * Public, unauthenticated. Returns ONLY name and category of tools that are
 * available right now: no ids, owner, description or dates.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const tools = await activeTools(ctx);
    const result: { name: string; category: string }[] = [];
    for (const t of tools) {
      const a = await availabilityOf(ctx, t._id, today);
      if (a.state === "available") result.push({ name: t.name, category: t.category });
    }
    return result;
  },
});

/** Signed-in browse view: every listing with availability. */
export const list = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const today = todayUtc();
    const tools = await activeTools(ctx, args.category);
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          // Minimal owner info: first name and the trust badge, never email.
          ownerFirstName: owner ? firstName(owner.name) : "Neighbour",
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: t.ownerId === viewer._id,
          availability: await availabilityOf(ctx, t._id, today),
        };
      }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const today = todayUtc();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .order("desc")
      .collect();
    return await Promise.all(
      tools
        .filter((t) => t.removedAt === undefined)
        .map(async (t) => {
          const pending = await ctx.db
            .query("loans")
            .withIndex("by_tool_status", (q) => q.eq("toolId", t._id).eq("status", "pending"))
            .collect();
          return {
            _id: t._id,
            name: t.name,
            category: t.category,
            condition: t.condition,
            description: t.description,
            pendingRequests: pending.length,
            availability: await availabilityOf(ctx, t._id, today),
          };
        }),
    );
  },
});

function cleanToolInput(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > LIMITS.toolName) {
    throw new ConvexError(`Name must be 2–${LIMITS.toolName} characters.`);
  }
  if (description.length > LIMITS.toolDescription) {
    throw new ConvexError(`Description must be at most ${LIMITS.toolDescription} characters.`);
  }
  return { name, description };
}

export const create = mutation({
  args: { name: v.string(), category, condition, description: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const { name, description } = cleanToolInput(args);
    const existing = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .collect();
    if (existing.filter((t) => t.removedAt === undefined).length >= LIMITS.maxListingsPerUser) {
      throw new ConvexError(`You can have at most ${LIMITS.maxListingsPerUser} listings.`);
    }
    return await ctx.db.insert("tools", {
      ownerId: viewer._id,
      name,
      category: args.category,
      condition: args.condition,
      description,
      updatedAt: Date.now(),
    });
  },
});

/** Owners only. Admins moderate by removing, not by editing others' text. */
export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("Listing not found.");
    if (tool.ownerId !== viewer._id) throw new ConvexError("You can only edit your own listings.");
    const { name, description } = cleanToolInput(args);
    await ctx.db.patch(tool._id, {
      name,
      description,
      category: args.category,
      condition: args.condition,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Owner removes their own listing; admin can remove any. Soft delete so loan
 * history survives. Pending requests are declined (and the borrowers told);
 * an active loan stays visible so it can still be marked returned.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const viewer = await requireViewer(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("Listing not found.");
    if (tool.ownerId !== viewer._id && !isAdmin(viewer)) {
      throw new ConvexError("You can only remove your own listings.");
    }
    const now = Date.now();
    await ctx.db.patch(toolId, { removedAt: now, removedBy: viewer._id });

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    for (const loan of pending) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
      await enqueueLoanEvent(ctx, loan._id, "request.declined", "listing removed");
    }
  },
});
