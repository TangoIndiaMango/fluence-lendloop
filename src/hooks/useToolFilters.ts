"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { CATEGORIES, type Category } from "@convex/lib/constants";

export type ToolFilters = { category?: Category; q: string; availableOnly: boolean };

/**
 * Browse filters live in the URL (?category=…&q=…&available=1), so they
 * survive refresh, the back button and sharing a link.
 * Category is filtered on the server (indexed); text and availability on
 * the client, since the list is already capped and loaded.
 */
export function useToolFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: ToolFilters = useMemo(() => {
    const raw = params.get("category");
    return {
      category: CATEGORIES.includes(raw as Category) ? (raw as Category) : undefined,
      q: params.get("q") ?? "",
      availableOnly: params.get("available") === "1",
    };
  }, [params]);

  const setFilters = useCallback(
    (patch: Partial<ToolFilters>) => {
      const next = { ...filters, ...patch };
      const sp = new URLSearchParams();
      if (next.category) sp.set("category", next.category);
      if (next.q.trim()) sp.set("q", next.q);
      if (next.availableOnly) sp.set("available", "1");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );

  const isFiltered = Boolean(filters.category || filters.q.trim() || filters.availableOnly);
  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  return { filters, setFilters, isFiltered, clear };
}

export function matchesFilters(
  tool: { name: string; description: string; availability: { state: string } },
  { q, availableOnly }: ToolFilters,
) {
  if (availableOnly && tool.availability.state !== "available") return false;
  const needle = q.trim().toLowerCase();
  return !needle || tool.name.toLowerCase().includes(needle) || tool.description.toLowerCase().includes(needle);
}
