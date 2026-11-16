"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@convex/lib/constants";
import type { ToolFilters } from "@/hooks/useToolFilters";

const SEARCH_DEBOUNCE_MS = 250;

export function ToolFilterBar({
  filters,
  onChange,
}: {
  filters: ToolFilters;
  onChange: (patch: Partial<ToolFilters>) => void;
}) {
  // Local state so typing stays instant; the URL updates after a pause.
  const [q, setQ] = useState(filters.q);
  // If the URL changes from outside (back button, "Clear filters"), follow
  // it. Adjusting state during render avoids an extra effect pass.
  const [urlQ, setUrlQ] = useState(filters.q);
  if (filters.q !== urlQ) {
    setUrlQ(filters.q);
    setQ(filters.q);
  }
  useEffect(() => {
    if (q === filters.q) return;
    const t = setTimeout(() => onChange({ q }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, filters.q, onChange]);

  return (
    <div className="mb-5 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input sm:max-w-xs"
          placeholder="Search tools…"
          aria-label="Search tools"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={filters.availableOnly}
            onChange={(e) => onChange({ availableOnly: e.target.checked })}
          />
          Available now
        </label>
      </div>
      <div
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        role="group"
        aria-label="Filter by category"
      >
        {[undefined, ...CATEGORIES].map((c) => {
          const active = filters.category === c;
          return (
            <button
              key={c ?? "all"}
              onClick={() => onChange({ category: c })}
              aria-pressed={active}
              className={`chip shrink-0 whitespace-nowrap ${active ? "border-accent bg-accent text-white" : "border-border bg-card hover:bg-surface-muted"}`}
            >
              {c ?? "All"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
