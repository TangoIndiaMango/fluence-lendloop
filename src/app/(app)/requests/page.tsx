"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { LoanCard } from "@/components/LoanCard";
import { ActionButton, Empty, PageHeader, Skeleton } from "@/components/ui";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);

  return (
    <>
      <PageHeader title="My requests" subtitle="Things you've asked to borrow." />
      {loans === undefined ? (
        <Skeleton />
      ) : loans.length === 0 ? (
        <Empty>
          No requests yet. <Link href="/browse" className="text-accent underline">Find something to borrow</Link>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {loans.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              perspective="borrower"
              actions={
                loan.status === "pending" && (
                  <ActionButton confirm="Withdraw this request?" onAction={() => cancel({ loanId: loan._id })}>
                    Withdraw
                  </ActionButton>
                )
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
