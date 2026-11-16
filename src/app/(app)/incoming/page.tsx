"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { LoanGroup, type Loan } from "@/components/loans/LoanCard";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);

  const actions = (loan: Loan) => {
    if (loan.status === "pending") {
      return (
        <>
          <ActionButton variant="primary" busyLabel="Approving…" onAction={() => approve({ loanId: loan._id })}>
            Approve
          </ActionButton>
          <ActionButton busyLabel="Declining…" onAction={() => decline({ loanId: loan._id })}>
            Decline
          </ActionButton>
        </>
      );
    }
    if (loan.status === "approved") {
      return (
        <ActionButton
          confirm={{ prompt: "Got it back?", confirmLabel: "Yes, returned" }}
          variant="primary"
          onAction={() => markReturned({ loanId: loan._id })}
        >
          Mark returned
        </ActionButton>
      );
    }
    return null;
  };

  return (
    <>
      <PageHeader title="Incoming requests" subtitle="Requests to borrow your tools." />
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <Empty
          title="No requests yet"
          action={<Link href="/listings" className="btn-secondary">Check your listings</Link>}
        >
          When a neighbour asks to borrow one of your tools, it shows up here.
        </Empty>
      ) : (
        <>
          <LoanGroup title="Waiting for you" perspective="owner" actions={actions} loans={loans.filter((l) => l.status === "pending")} />
          <LoanGroup title="Out on loan" perspective="owner" actions={actions} loans={loans.filter((l) => l.status === "approved")} />
          <LoanGroup title="History" perspective="owner" loans={loans.filter((l) => l.status !== "pending" && l.status !== "approved")} />
        </>
      )}
    </>
  );
}
