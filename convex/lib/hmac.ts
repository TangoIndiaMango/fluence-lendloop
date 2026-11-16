// HMAC-SHA256 signing shared by every Convex <-> n8n call.
//
// Signed string: `${timestamp}.${rawBody}` where timestamp is unix seconds.
// Headers: X-LendLoop-Timestamp, X-LendLoop-Signature: sha256=<hex>.
// Receivers reject anything older/newer than MAX_SKEW_SECONDS, which bounds
// replay; idempotency keys on every write-back handle the rest.

export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";
export const MAX_SKEW_SECONDS = 300;

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signBody(
  secret: string,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  const timestamp = String(nowSeconds);
  const signature = await hmacHex(secret, `${timestamp}.${body}`);
  return {
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: `sha256=${signature}`,
  };
}

/** Constant-time comparison so response timing doesn't leak the signature. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export async function verifySignature(
  secret: string,
  body: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifyResult> {
  if (!timestampHeader || !signatureHeader) {
    return { ok: false, reason: "missing signature headers" };
  }
  const timestamp = Number(timestampHeader);
  if (!Number.isInteger(timestamp)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(nowSeconds - timestamp) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp outside allowed window" };
  }
  const expected = `sha256=${await hmacHex(secret, `${timestampHeader}.${body}`)}`;
  return timingSafeEqual(expected, signatureHeader)
    ? { ok: true }
    : { ok: false, reason: "signature mismatch" };
}
