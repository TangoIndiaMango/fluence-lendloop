"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "@convex/_generated/api";
import { ActivityLine, StatusBadge, TrustedBadge } from "@/components/ui";
import { ToolImage } from "@/components/tools/CategoryArt";
import { formatRange } from "@/lib/format";

export type Loan = FunctionReturnType<typeof api.loans.myRequests>[number];
export type Perspective = "borrower" | "owner" | "admin";

function counterpart(loan: Loan, perspective: Perspective): string {
  const owner = loan.owner?.firstName ?? "a neighbour";
  const borrower = loan.borrower?.firstName ?? "a neighbour";
  if (perspective === "borrower") return `from ${owner}`;
  if (perspective === "owner") return `by ${borrower}`;
  return `${borrower} from ${owner}`;
}

export function LoanCard({ loan, perspective, actions }: { loan: Loan; perspective: Perspective; actions?: ReactNode }) {
  const contact = perspective === "borrower" ? loan.owner?.email : loan.borrower?.email;

  return (
    <li className="card">
      {/* Phones: actions get their own row so the details keep full width. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {loan.tool && (
            <ToolImage
              src={loan.tool.imageUrl}
              category={loan.tool.category}
              name={loan.tool.name}
              className="h-14 w-14 shrink-0 rounded-lg"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{loan.tool?.name ?? "Removed tool"}</h3>
              <StatusBadge status={loan.status} overdue={loan.overdue} />
              {loan.tool?.removed && <span className="text-xs text-muted">(listing removed)</span>}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {formatRange(loan.startDate, loan.endDate)} · {counterpart(loan, perspective)}
              {perspective === "borrower" && loan.owner?.trusted && (
                <span className="ml-1.5">
                  <TrustedBadge />
                </span>
              )}
            </p>
            {loan.message && <p className="mt-2 border-l-2 border-border pl-2 text-sm italic">“{loan.message}”</p>}
            {contact && (
              <p className="mt-2 text-sm">
                Arrange pick-up:{" "}
                <a className="focus-ring rounded text-accent underline" href={`mailto:${contact}`}>
                  {contact}
                </a>
              </p>
            )}
            <ActivityLine activity={loan.activity} />
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </li>
  );
}

/** A titled group of loan cards; renders nothing when empty. */
export function LoanGroup({
  title,
  loans,
  perspective,
  actions,
}: {
  title: string;
  loans: Loan[];
  perspective: Perspective;
  actions?: (loan: Loan) => ReactNode;
}) {
  if (loans.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="section-title">
        {title} <span className="font-normal normal-case">({loans.length})</span>
      </h2>
      <ul className="grid gap-3">
        {loans.map((loan) => (
          <LoanCard key={loan._id} loan={loan} perspective={perspective} actions={actions?.(loan)} />
        ))}
      </ul>
    </section>
  );
}
