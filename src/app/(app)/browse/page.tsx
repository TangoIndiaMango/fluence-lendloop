"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { Suspense } from "react";
import { api } from "@convex/_generated/api";
import { ToolCard } from "@/components/tools/ToolCard";
import { ToolFilterBar } from "@/components/tools/ToolFilterBar";
import { Empty, PageHeader, Skeleton } from "@/components/ui";
import { matchesFilters, useToolFilters } from "@/hooks/useToolFilters";
import { plural } from "@/lib/format";

function Browse() {
  const { filters, setFilters, isFiltered, clear } = useToolFilters();
  const tools = useQuery(api.tools.list, { category: filters.category });
  const me = useQuery(api.users.me);
  const remove = useMutation(api.tools.remove);
  const visible = tools?.filter((t) => matchesFilters(t, filters));

  return (
    <>
      <PageHeader
        title="All tools"
        subtitle="Everything listed by your neighbours."
        action={<Link href="/listings?new=1" className="btn-primary">List a tool</Link>}
      />
      <ToolFilterBar filters={filters} onChange={setFilters} />

      {visible === undefined ? (
        <Skeleton rows={4} />
      ) : visible.length === 0 ? (
        isFiltered ? (
          <Empty
            title="No tools match these filters"
            action={<button className="btn-secondary" onClick={clear}>Clear filters</button>}
          />
        ) : (
          <Empty
            title="Nothing listed yet"
            action={<Link href="/listings?new=1" className="btn-primary">List the first tool</Link>}
          >
            Your neighbours haven&apos;t listed anything. Start the loop with something from your shed.
          </Empty>
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {plural(visible.length, "tool")}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {visible.map((t) => (
              <ToolCard
                key={t._id}
                tool={t}
                canModerate={me?.role === "admin"}
                onRemove={() => remove({ toolId: t._id })}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <Browse />
    </Suspense>
  );
}
