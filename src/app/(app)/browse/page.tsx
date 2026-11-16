"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CATEGORIES, type Category } from "@convex/lib/constants";
import { RequestForm } from "@/components/RequestForm";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [openFor, setOpenFor] = useState<Id<"tools"> | null>(null);
  const [sentFor, setSentFor] = useState<Id<"tools"> | null>(null);
  const tools = useQuery(api.tools.list, { category });
  const me = useQuery(api.users.me);
  const remove = useMutation(api.tools.remove);

  return (
    <>
      <PageHeader
        title="All tools"
        subtitle="Everything listed by your neighbours."
        action={<Link href="/listings?new=1" className="btn-primary">List a tool</Link>}
      />

      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {[undefined, ...CATEGORIES].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={`rounded-full border px-3 py-1 text-sm ${
              category === c ? "border-accent bg-accent text-white" : "border-border bg-card hover:bg-[#f3f0ea]"
            }`}
          >
            {c ?? "All"}
          </button>
        ))}
      </div>

      {tools === undefined ? (
        <Skeleton />
      ) : tools.length === 0 ? (
        <Empty>
          No tools {category ? `in ${category} ` : ""}yet.{" "}
          <Link href="/listings?new=1" className="text-accent underline">List one</Link>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tools.map((t) => (
            <li key={t._id} className="card flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{t.name}</h2>
                  <p className="text-xs text-muted">
                    {t.category} · {t.condition} condition
                  </p>
                </div>
                {t.availability.state === "available" ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                    Available
                  </span>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.availability.overdue ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                    }`}
                  >
                    {t.availability.overdue ? "Overdue" : `Out until ${formatDate(t.availability.until)}`}
                  </span>
                )}
              </div>
              {t.description && <p className="mt-2 text-sm">{t.description}</p>}
              <p className="mt-2 text-xs text-muted">
                Lent by {t.isMine ? "you" : t.ownerFirstName}
                {t.ownerTrusted && <span className="ml-1.5 font-medium text-accent">✓ Trusted Lender</span>}
                {t.availability.state === "available" && t.availability.nextBookedFrom && (
                  <> · booked from {formatDate(t.availability.nextBookedFrom)}</>
                )}
              </p>

              <div className="mt-auto flex flex-wrap items-start gap-2 pt-3">
                {!t.isMine && openFor !== t._id && (
                  <button className="btn-secondary" onClick={() => { setOpenFor(t._id); setSentFor(null); }}>
                    Request to borrow
                  </button>
                )}
                {me?.role === "admin" && !t.isMine && (
                  <ActionButton
                    variant="danger"
                    confirm={`Remove "${t.name}" from LendLoop? Pending requests will be declined.`}
                    onAction={() => remove({ toolId: t._id })}
                  >
                    Remove (admin)
                  </ActionButton>
                )}
              </div>
              {sentFor === t._id && (
                <p className="mt-2 text-sm text-accent" role="status">
                  Request sent. Track it in <Link className="underline" href="/requests">My requests</Link>.
                </p>
              )}
              {openFor === t._id && (
                <RequestForm
                  toolId={t._id}
                  onDone={(sent) => {
                    setOpenFor(null);
                    if (sent) setSentFor(t._id);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
