"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";

/**
 * Ensures a Convex `users` row exists for the signed-in Clerk user and
 * returns it. Role comes from the database, never from the client.
 */
export function useStoreUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [stored, setStored] = useState(false);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store()
      .then(() => !cancelled && setStored(true))
      .catch(() => !cancelled && setStored(false));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);

  return {
    isLoading: isLoading || (isAuthenticated && (!stored || me === undefined || me === null)),
    isAuthenticated,
    me: me ?? null,
  };
}
