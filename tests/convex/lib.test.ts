import { describe, expect, test } from "vitest";
import { addDays, daysBetween, isValidIsoDate, rangesOverlap, todayUtc } from "../../convex/lib/dates";
import { signBody, verifySignature } from "../../convex/lib/hmac";
import { isAllowedPhotoUrl, sizedPhotoUrl } from "../../convex/lib/photos";
import { assertBookableRange } from "../../convex/model/loans";
import { cleanToolInput } from "../../convex/model/tools";

// Pure helpers: no database needed.

describe("dates", () => {
  test("validates real calendar dates only", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true); // leap year
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2027-13-01")).toBe(false);
    expect(isValidIsoDate("27-01-01")).toBe(false);
    expect(isValidIsoDate("2027-1-1")).toBe(false);
  });

  test("date maths works across month ends", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(daysBetween("2027-02-27", "2027-03-01")).toBe(2);
    expect(todayUtc(Date.UTC(2027, 0, 5, 23, 59))).toBe("2027-01-05");
  });

  test("ranges overlap inclusively", () => {
    const a = { startDate: "2027-01-01", endDate: "2027-01-03" };
    expect(rangesOverlap(a, { startDate: "2027-01-03", endDate: "2027-01-05" })).toBe(true);
    expect(rangesOverlap(a, { startDate: "2027-01-04", endDate: "2027-01-05" })).toBe(false);
  });

  test("bookable ranges: a valid one passes, an impossible one doesn't", () => {
    const today = "2027-01-10";
    expect(() => assertBookableRange({ startDate: "2027-01-10", endDate: "2027-01-12" }, today)).not.toThrow();
    expect(() => assertBookableRange({ startDate: "2027-02-30", endDate: "2027-03-01" }, today)).toThrow();
  });
});

describe("hmac", () => {
  const now = 1_800_000_000;

  test("a signature made with the secret verifies", async () => {
    const h = await signBody("s3cret", '{"a":1}', now);
    expect(await verifySignature("s3cret", '{"a":1}', h["x-lendloop-timestamp"], h["x-lendloop-signature"], now)).toEqual({
      ok: true,
    });
  });

  test.each([
    ["wrong secret", "other", '{"a":1}', 0],
    ["changed body", "s3cret", '{"a":2}', 0],
    ["stale timestamp", "s3cret", '{"a":1}', 301],
  ])("rejects a %s", async (_, secret, body, delay) => {
    const h = await signBody("s3cret", '{"a":1}', now);
    const result = await verifySignature(secret, body, h["x-lendloop-timestamp"], h["x-lendloop-signature"], now + delay);
    expect(result.ok).toBe(false);
  });

  test("rejects missing headers", async () => {
    expect((await verifySignature("s3cret", "{}", null, null, now)).ok).toBe(false);
  });
});

describe("photo links", () => {
  test("only accept Unsplash CDN photo paths over https", () => {
    expect(isAllowedPhotoUrl("https://images.unsplash.com/photo-1504148455328-c376907d081c")).toBe(true);
    expect(isAllowedPhotoUrl("http://images.unsplash.com/photo-1")).toBe(false);
    expect(isAllowedPhotoUrl("https://images.unsplash.com.evil.test/photo-1")).toBe(false);
    expect(isAllowedPhotoUrl("https://images.unsplash.com/../secret")).toBe(false);
    expect(isAllowedPhotoUrl("javascript:alert(1)")).toBe(false);
  });

  test("sizing replaces any existing query", () => {
    expect(sizedPhotoUrl("https://images.unsplash.com/photo-1?w=5000")).toBe(
      "https://images.unsplash.com/photo-1?w=800&h=450&fit=crop&auto=format&q=70",
    );
  });
});

describe("tool input", () => {
  test("trims and enforces lengths", () => {
    expect(cleanToolInput({ name: "  Saw ", description: " sharp " })).toEqual({ name: "Saw", description: "sharp" });
    expect(() => cleanToolInput({ name: "x".repeat(61), description: "" })).toThrow();
    expect(() => cleanToolInput({ name: "Saw", description: "x".repeat(501) })).toThrow();
  });
});
