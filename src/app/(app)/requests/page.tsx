"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { LoanGroup, type Loan } from "@/components/loans/LoanCard";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";

const isActive = (l: Loan) => l.status === "pending" || l.status === "approved";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);

  const actions = (loan: Loan) =>
    loan.status === "pending" && (
      <ActionButton
        confirm={{ prompt: "Withdraw this request?", confirmLabel: "Withdraw" }}
        onAction={() => cancel({ loanId: loan._id })}
      >
        Withdraw
      </ActionButton>
    );

  return (
    <>
      <PageHeader title="My requests" subtitle="Things you've asked to borrow." />
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <Empty title="No requests yet" action={<Link href="/browse" className="btn-primary">Find something to borrow</Link>} />
      ) : (
        <>
          <LoanGroup title="Active" perspective="borrower" actions={actions} loans={loans.filter(isActive)} />
          <LoanGroup title="Past" perspective="borrower" loans={loans.filter((l) => !isActive(l))} />
        </>
      )}
    </>
  );
}
