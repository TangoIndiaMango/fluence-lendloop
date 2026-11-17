/// <reference types="vitest/importMeta" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { addDays, todayUtc } from "../../convex/lib/dates";
import schema from "../../convex/schema";

// Shared harness for the Convex tests. convex-test runs the real functions
// against an in-memory database, so these exercise the same code that
// production runs, auth checks included.

const modules = import.meta.glob(["../../convex/**/*.ts", "../../convex/**/*.js", "!../../convex/**/*.d.ts"]);

/** A date `n` days from today, as YYYY-MM-DD. */
export const day = (n: number) => addDays(todayUtc(), n);

type Person = { name: string; email?: string };

export function setup() {
  const t = convexTest(schema, modules);

  /** Sign in as someone; creates their user row the way the app does. */
  async function signIn(key: string, person: Person) {
    const user = t.withIdentity({
      subject: key,
      issuer: "test",
      tokenIdentifier: `test|${key}`,
      name: person.name,
      email: person.email,
    });
    const id = await user.mutation(api.users.store, {});
    return Object.assign(user, { id });
  }

  async function makeAdmin(id: Id<"users">) {
    await t.run((ctx) => ctx.db.patch(id, { role: "admin" }));
  }

  /** Signs in the usual cast: a lender, a borrower and an admin. */
  async function cast() {
    const ada = await signIn("ada", { name: "Ada Okafor", email: "ada@test.local" });
    const bayo = await signIn("bayo", { name: "Bayo Adeyemi", email: "bayo@test.local" });
    const admin = await signIn("admin", { name: "Admin Person", email: "admin@test.local" });
    await makeAdmin(admin.id);
    return { ada, bayo, admin };
  }

  async function listTool(owner: Awaited<ReturnType<typeof signIn>>, name = "Cordless drill") {
    return await owner.mutation(api.tools.create, {
      name,
      category: "Power tools",
      condition: "good",
      description: "Two batteries",
    });
  }

  return { t, signIn, makeAdmin, cast, listTool };
}

/** Assert that a call fails with one of our coded errors. */
export async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected a ${code} error, but the call succeeded`).not.toBeNull();
  expect((error as { data?: { code?: string } }).data?.code).toBe(code);
}
