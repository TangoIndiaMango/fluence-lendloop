import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { ORPHAN_UPLOAD_GRACE_MS } from "../../convex/lib/constants";
import { day, expectCode, setup } from "./setup";

// Fake timers keep the scheduled n8n deliveries from firing mid-test.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

describe("tools.listPublic", () => {
  test("returns only name and category of available tools", async () => {
    const { t, cast, listTool } = setup();
    const { ada } = await cast();
    await listTool(ada, "Cordless drill");

    const list = await t.query(api.tools.listPublic, {});
    expect(list).toEqual([{ name: "Cordless drill", category: "Power tools" }]);
  });

  test("hides tools that are on loan today or removed", async () => {
    const { t, cast, listTool } = setup();
    const { ada, bayo } = await cast();
    const drill = await listTool(ada, "Cordless drill");
    const ladder = await listTool(ada, "Ladder");
    const loanId = await bayo.mutation(api.loans.request, { toolId: drill, startDate: day(0), endDate: day(2) });
    await ada.mutation(api.loans.approve, { loanId });
    await ada.mutation(api.tools.remove, { toolId: ladder });

    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });
});

describe("tools.list", () => {
  test("needs sign-in", async () => {
    const { t } = setup();
    await expectCode(t.query(api.tools.list, {}), "UNAUTHENTICATED");
  });

  test("shows the owner's first name and badge but never their email", async () => {
    const { cast, listTool } = setup();
    const { ada, bayo } = await cast();
    await listTool(ada);
    const [tool] = await bayo.query(api.tools.list, {});
    expect(tool).toMatchObject({ ownerFirstName: "Ada", ownerTrusted: false, isMine: false });
    expect(JSON.stringify(tool)).not.toContain("ada@test.local");
  });

  test("filters by category", async () => {
    const { cast, listTool } = setup();
    const { ada, bayo } = await cast();
    await listTool(ada);
    expect(await bayo.query(api.tools.list, { category: "Garden" })).toEqual([]);
    expect(await bayo.query(api.tools.list, { category: "Power tools" })).toHaveLength(1);
  });
});

describe("tools.create and update", () => {
  test("trims input and validates the name", async () => {
    const { t, cast } = setup();
    const { ada } = await cast();
    const base = { category: "Garden", condition: "fair", description: "  sharp  " } as const;
    const id = await ada.mutation(api.tools.create, { ...base, name: "  Hedge trimmer " });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ name: "Hedge trimmer", description: "sharp" });
    await expectCode(ada.mutation(api.tools.create, { ...base, name: "x" }), "INVALID_INPUT");
  });

  test("only the owner can edit a listing, not even an admin", async () => {
    const { cast, listTool } = setup();
    const { ada, bayo, admin } = await cast();
    const toolId = await listTool(ada);
    const edit = { toolId, name: "Hacked", category: "Other", condition: "worn", description: "" } as const;
    await expectCode(bayo.mutation(api.tools.update, edit), "FORBIDDEN");
    await expectCode(admin.mutation(api.tools.update, edit), "FORBIDDEN");
    await ada.mutation(api.tools.update, { ...edit, name: "Better drill" });
  });
});

describe("tools.remove", () => {
  test("owners and admins can remove; other users can't", async () => {
    const { cast, listTool } = setup();
    const { ada, bayo, admin } = await cast();
    const mine = await listTool(ada, "Drill");
    const other = await listTool(ada, "Saw");
    await expectCode(bayo.mutation(api.tools.remove, { toolId: mine }), "FORBIDDEN");
    await ada.mutation(api.tools.remove, { toolId: mine });
    await admin.mutation(api.tools.remove, { toolId: other });
    await expectCode(ada.mutation(api.tools.remove, { toolId: mine }), "NOT_FOUND");
  });

  test("declines pending requests and tells the borrower", async () => {
    const { t, cast, listTool } = setup();
    const { ada, bayo } = await cast();
    const toolId = await listTool(ada);
    const loanId = await bayo.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
    await ada.mutation(api.tools.remove, { toolId });

    expect((await t.run((ctx) => ctx.db.get(loanId)))?.status).toBe("declined");
    const outbox = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(outbox.map((o) => o.type)).toEqual(["request.created", "request.declined"]);
  });
});

describe("listing photos", () => {
  test("accepts a PNG and returns a URL to signed-in users only", async () => {
    const { t, cast } = setup();
    const { ada, bayo } = await cast();
    const imageId = await t.run((ctx) => ctx.storage.store(png()));
    await ada.mutation(api.tools.create, {
      name: "Drill",
      category: "Power tools",
      condition: "good",
      description: "",
      imageId,
    });
    const [tool] = await bayo.query(api.tools.list, {});
    expect(tool.imageUrl).toEqual(expect.any(String));
    expect(await t.query(api.tools.listPublic, {})).toEqual([{ name: "Drill", category: "Power tools" }]);
  });

  test("rejects a non-image by its stored type; the cleanup job deletes it later", async () => {
    const { t, cast } = setup();
    const { ada } = await cast();
    const bad = await t.run((ctx) => ctx.storage.store(new Blob(["<script>"], { type: "text/html" })));
    const good = await t.run((ctx) => ctx.storage.store(png()));
    const fields = { name: "Drill", category: "Other", condition: "good", description: "" } as const;
    await expectCode(ada.mutation(api.tools.create, { ...fields, imageId: bad }), "INVALID_INPUT");
    await ada.mutation(api.tools.create, { ...fields, imageId: good });

    // Within the grace period nothing is touched (an upload may be mid-form).
    expect(await t.mutation(internal.tools.cleanOrphanUploads, {})).toEqual({ deleted: 0 });
    vi.advanceTimersByTime(ORPHAN_UPLOAD_GRACE_MS + 1_000);
    expect(await t.mutation(internal.tools.cleanOrphanUploads, {})).toEqual({ deleted: 1 });
    expect(await t.run((ctx) => ctx.db.system.get(bad))).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(good))).not.toBeNull();
  });

  test("refuses a photo that already belongs to someone else's listing", async () => {
    const { t, cast } = setup();
    const { ada, bayo } = await cast();
    const imageId = await t.run((ctx) => ctx.storage.store(png()));
    const input = { name: "Drill", category: "Other", condition: "good", description: "", imageId } as const;
    await ada.mutation(api.tools.create, input);
    await expectCode(bayo.mutation(api.tools.create, input), "FORBIDDEN");
  });

  test("removing the photo deletes the stored file", async () => {
    const { t, cast } = setup();
    const { ada } = await cast();
    const imageId = await t.run((ctx) => ctx.storage.store(png()));
    const fields = { name: "Drill", category: "Other", condition: "good", description: "" } as const;
    const toolId = await ada.mutation(api.tools.create, { ...fields, imageId });
    await ada.mutation(api.tools.update, { ...fields, toolId, imageId: null });

    expect((await t.run((ctx) => ctx.db.get(toolId)))?.imageId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.system.get(imageId))).toBeNull();
  });
});
