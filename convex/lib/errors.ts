import { ConvexError } from "convex/values";

/**
 * One error shape for every user-facing failure: `{ code, message }`.
 * The code is stable and machine-readable (the UI and n8n can branch on it);
 * the message is safe to show to the person who triggered it.
 *
 * Plain `Error`s are reserved for bugs. Convex redacts those in production,
 * so nothing internal ever leaks to the browser.
 */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "PROFILE_PENDING",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_STATE",
  "CONFLICT",
  "LIMIT_REACHED",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type AppErrorData = { code: ErrorCode; message: string };

export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError<AppErrorData>({ code, message });
}
