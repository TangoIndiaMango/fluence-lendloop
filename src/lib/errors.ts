import { ConvexError } from "convex/values";
import { ERROR_CODES, type AppErrorData, type ErrorCode } from "@convex/lib/errors";

const FALLBACK = "Something went wrong. Please try again.";

function appError(e: unknown): AppErrorData | null {
  if (!(e instanceof ConvexError)) return null;
  const data = e.data as Partial<AppErrorData> | undefined;
  if (data && typeof data.message === "string" && ERROR_CODES.includes(data.code as ErrorCode)) {
    return data as AppErrorData;
  }
  return null;
}

/** The server's user-safe message, or a generic one for anything unexpected. */
export function errorMessage(e: unknown): string {
  return appError(e)?.message ?? FALLBACK;
}

/** The stable error code, for UI that branches on the kind of failure. */
export function errorCode(e: unknown): ErrorCode | null {
  return appError(e)?.code ?? null;
}
