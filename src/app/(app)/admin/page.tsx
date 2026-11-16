"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";
import { timeAgo } from "@/lib/format";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  // Every admin query re-checks the role in Convex; a non-admin who opens
  // this URL gets an error from the server, not data.
  const isAdmin = me?.role === "admin";
  const lenders = useQuery(api.users.lenders, isAdmin ? {} : "skip");
  const loans = useQuery(api.loans.all, isAdmin ? {} : "skip");
  const health = useQuery(api.automation.health, isAdmin ? {} : "skip");
  const setTrusted = useMutation(api.users.setTrustedLender);

  if (me === undefined) return <Skeleton />;
  if (!isAdmin) return <Empty>This area is for admins.</Empty>;

  return (
    <>
      <PageHeader title="Admin" subtitle="Moderate listings from All tools; manage lenders and loans here." />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Automation health</h2>
        {health === undefined ? (
          <Skeleton rows={1} />
        ) : (
          <div className="card grid gap-3 text-sm">
            <p>
              Deliveries waiting or retrying: <strong>{health.pendingDeliveries}</strong> · Failed after retries:{" "}
              <strong className={health.failedDeliveries.length ? "text-red-700" : ""}>
                {health.failedDeliveries.length}
              </strong>
            </p>
            {health.errors.length === 0 ? (
              <p className="text-muted">No n8n workflow errors reported.</p>
            ) : (
              <ul className="grid gap-1.5">
                {health.errors.map((e) => (
                  <li key={e._id} className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
                    <strong>{e.workflowName}</strong> failed at “{e.nodeName}”: {e.message}{" "}
                    <span className="text-red-600/80">· {timeAgo(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Lenders</h2>
        {lenders === undefined ? (
          <Skeleton rows={2} />
        ) : lenders.length === 0 ? (
          <Empty>No one has listed a tool yet.</Empty>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Listings</th>
                  <th className="px-4 py-2 font-medium">Trusted Lender</th>
                </tr>
              </thead>
              <tbody>
                {lenders.map((u) => (
                  <tr key={u._id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      {u.name} {u.role === "admin" && <span className="text-xs text-muted">(admin)</span>}
                    </td>
                    <td className="px-4 py-2 text-muted">{u.email ?? "—"}</td>
                    <td className="px-4 py-2">{u.activeListings}</td>
                    <td className="px-4 py-2">
                      <ActionButton
                        variant={u.trustedLender ? "primary" : "secondary"}
                        onAction={() => setTrusted({ userId: u._id, trusted: !u.trustedLender })}
                      >
                        {u.trustedLender ? "✓ Trusted" : "Mark trusted"}
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">All loans</h2>
        {loans === undefined ? (
          <Skeleton />
        ) : loans.length === 0 ? (
          <Empty>No loans yet.</Empty>
        ) : (
          <ul className="grid gap-3">
            {loans.map((loan) => (
              <LoanCard key={loan._id} loan={loan} perspective="admin" />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
