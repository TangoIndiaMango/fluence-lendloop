import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer, requireAdmin } from "./lib/auth";
import { fail } from "./lib/errors";

/**
 * Called by the client right after Clerk sign-in. Creates or refreshes the
 * user's row from the verified JWT claims. Role is never taken from the client.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED", "Not signed in.");

    const name = (
      identity.name ||
      [identity.givenName, identity.familyName].filter(Boolean).join(" ")
    ).trim();
    const email = identity.email?.toLowerCase();

    const existing = await getViewer(ctx);
    if (existing) {
      const patch: { name?: string; email?: string } = {};
      if (name && name !== existing.name) patch.name = name;
      if (email && email !== existing.email) patch.email = email;
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: name || email?.split("@")[0] || "Neighbour",
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

/** The signed-in user's own profile (role drives which nav items show). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
      hasEmail: Boolean(user.email),
    };
  },
});

/** Admin: everyone who has listed at least one tool, for Trusted Lender. */
export const lenders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(500);
    const rows = await Promise.all(
      users.map(async (u) => {
        const tools = await ctx.db
          .query("tools")
          .withIndex("by_owner", (q) => q.eq("ownerId", u._id))
          .collect();
        const active = tools.filter((t) => t.removedAt === undefined).length;
        return {
          _id: u._id,
          name: u.name,
          email: u.email ?? null,
          role: u.role,
          trustedLender: u.trustedLender,
          activeListings: active,
        };
      }),
    );
    return rows
      .filter((r) => r.activeListings > 0 || r.trustedLender)
      .sort((a, b) => b.activeListings - a.activeListings);
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (!target) fail("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

/**
 * Bootstrap an admin from the CLI or dashboard only (internal = not callable
 * from the browser):  npx convex run users:setRole '{"email":"me@x.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("user"), v.literal("admin")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!user) fail("NOT_FOUND", `No user with email ${email}. Sign in once first.`);
    await ctx.db.patch(user._id, { role });
    return `${user.name} is now ${role}`;
  },
});
