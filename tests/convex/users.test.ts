import { describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { expectCode, setup } from "./setup";

describe("users.store", () => {
  test("creates a normal user from the token claims", async () => {
    const { t, signIn } = setup();
    const ada = await signIn("ada", { name: "Ada Okafor", email: "Ada@Test.Local" });
    const row = await t.run((ctx) => ctx.db.get(ada.id));
    expect(row).toMatchObject({ name: "Ada Okafor", email: "ada@test.local", role: "user", trustedLender: false });
  });

  test("is idempotent and picks up a changed name or email", async () => {
    const { t, signIn } = setup();
    const first = await signIn("ada", { name: "Ada" });
    const again = await signIn("ada", { name: "Ada Okafor", email: "ada@test.local" });
    expect(again.id).toBe(first.id);
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(first.id))).toMatchObject({ name: "Ada Okafor", email: "ada@test.local" });
  });

  test("never lets a user keep or gain admin through store", async () => {
    const { t, signIn, makeAdmin } = setup();
    const ada = await signIn("ada", { name: "Ada" });
    await makeAdmin(ada.id);
    await signIn("ada", { name: "Ada" });
    // store must not reset the role either: it only touches name and email.
    expect((await t.run((ctx) => ctx.db.get(ada.id)))?.role).toBe("admin");
  });

  test("rejects anonymous callers", async () => {
    const { t } = setup();
    await expectCode(t.mutation(api.users.store, {}), "UNAUTHENTICATED");
  });
});

describe("users.me", () => {
  test("returns null when signed out and hides the email itself", async () => {
    const { t, signIn } = setup();
    expect(await t.query(api.users.me, {})).toBeNull();
    const ada = await signIn("ada", { name: "Ada", email: "ada@test.local" });
    const me = await ada.query(api.users.me, {});
    expect(me).toMatchObject({ name: "Ada", role: "user", hasEmail: true });
    expect(me).not.toHaveProperty("email");
  });
});

describe("admin user management", () => {
  test("only admins can see lenders or mark a Trusted Lender", async () => {
    const { cast, listTool } = setup();
    const { ada, bayo, admin } = await cast();
    await listTool(ada);

    await expectCode(bayo.query(api.users.lenders, {}), "FORBIDDEN");
    await expectCode(bayo.mutation(api.users.setTrustedLender, { userId: ada.id, trusted: true }), "FORBIDDEN");

    const lenders = await admin.query(api.users.lenders, {});
    expect(lenders.map((l) => l.name)).toEqual(["Ada Okafor"]); // only people with listings

    await admin.mutation(api.users.setTrustedLender, { userId: ada.id, trusted: true });
    expect((await admin.query(api.users.lenders, {}))[0].trustedLender).toBe(true);
  });

  test("setRole is internal and matches email case-insensitively", async () => {
    const { t, signIn } = setup();
    const ada = await signIn("ada", { name: "Ada", email: "ada@test.local" });
    await t.mutation(internal.users.setRole, { email: "ADA@test.local", role: "admin" });
    expect((await t.run((ctx) => ctx.db.get(ada.id)))?.role).toBe("admin");
    await expectCode(t.mutation(internal.users.setRole, { email: "nobody@test.local", role: "admin" }), "NOT_FOUND");
  });
});
