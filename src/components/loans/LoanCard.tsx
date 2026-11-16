"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "@convex/_generated/api";
import { formatRange } from "@/lib/format";
import { ActivityLine, StatusBadge } from "./ui";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];

export function LoanCard({
  loan,
  perspective,
  actions,
}: {
  loan: Loan;
  perspective: "borrower" | "owner" | "admin";
  actions?: ReactNode;
}) {
  const other =
    perspective === "borrower"
      ? `from ${loan.owner?.firstName ?? "a neighbour"}`
      : perspective === "owner"
        ? `by ${loan.borrower?.firstName ?? "a neighbour"}`
        : `${loan.borrower?.firstName ?? "?"} from ${loan.owner?.firstName ?? "?"}`;
  const contact = perspective === "borrower" ? loan.owner?.email : loan.borrower?.email;

  return (
    <li className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{loan.tool?.name ?? "Removed tool"}</h2>
            <StatusBadge status={loan.status} overdue={loan.overdue} />
            {loan.tool?.removed && <span className="text-xs text-muted">(listing removed)</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {formatRange(loan.startDate, loan.endDate)} · {other}
            {perspective === "borrower" && loan.owner?.trusted && (
              <span className="ml-1.5 font-medium text-accent">✓ Trusted Lender</span>
            )}
          </p>
          {loan.message && <p className="mt-2 border-l-2 border-border pl-2 text-sm italic">“{loan.message}”</p>}
          {contact && (
            <p className="mt-2 text-sm">
              Arrange pick-up: <a className="text-accent underline" href={`mailto:${contact}`}>{contact}</a>
            </p>
          )}
          <ActivityLine activity={loan.activity} />
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </li>
  );
}
