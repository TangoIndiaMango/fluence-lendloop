"use client";

import { useCallback, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";

/**
 * One place for the "busy / error / run" dance around a mutation.
 * `run` resolves to true on success and false on failure (the error is
 * already in state), so callers never need their own try/catch.
 */
export function useAsyncAction<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: Args): Promise<boolean> => {
      if (inFlight.current) return false; // ignore double-clicks
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        await action(...args);
        return true;
      } catch (e) {
        setError(errorMessage(e));
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [action],
  );

  return { run, busy, error, clearError: () => setError(null) };
}
