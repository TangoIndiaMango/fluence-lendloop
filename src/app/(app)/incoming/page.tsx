"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { LoanCard, type Loan } from "@/components/LoanCard";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  const groups: { title: string; items: Loan[] }[] = loans
    ? [
        { title: "Waiting for you", items: loans.filter((l) => l.status === "pending") },
        { title: "Out on loan", items: loans.filter((l) => l.status === "approved") },
        { title: "History", items: loans.filter((l) => !["pending", "approved"].includes(l.status)) },
      ]
    : [];

  return (
    <>
      <PageHeader title="Incoming requests" subtitle="Requests to borrow your tools." />
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <Empty>No one has asked to borrow your tools yet.</Empty>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.title} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{g.title}</h2>
              <ul className="grid gap-3">
                {g.items.map((loan) => (
                  <LoanCard
                    key={loan._id}
                    loan={loan}
                    perspective="owner"
                    actions={
                      loan.status === "pending" ? (
                        <>
                          <ActionButton variant="primary" onAction={() => approve({ loanId: loan._id })}>
                            Approve
                          </ActionButton>
                          <ActionButton onAction={() => decline({ loanId: loan._id })}>Decline</ActionButton>
                        </>
                      ) : loan.status === "approved" ? (
                        <ActionButton
                          confirm={`Mark "${loan.tool?.name}" as returned?`}
                          onAction={() => markReturned({ loanId: loan._id })}
                        >
                          Mark returned
                        </ActionButton>
                      ) : null
                    }
                  />
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  );
}
