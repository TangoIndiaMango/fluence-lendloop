import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Every authorisation decision lives in Convex functions. The UI hides
// buttons for convenience only; these helpers are the real gate.

export async function getViewer(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

export async function requireViewer(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Please sign in first.");
  const user = await getViewer(ctx);
  // users.store runs right after sign-in; this only happens in a narrow race.
  if (!user) throw new ConvexError("Your profile is still being set up. Try again in a moment.");
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireViewer(ctx);
  if (user.role !== "admin") throw new ConvexError("Admins only.");
  return user;
}

export function isAdmin(user: Doc<"users"> | null): boolean {
  return user?.role === "admin";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Neighbour";
}

export type Ctx = QueryCtx | MutationCtx;
