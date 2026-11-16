"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { HealthPanel } from "@/components/admin/HealthPanel";
import { LendersTable } from "@/components/admin/LendersTable";
import { LoanCard } from "@/components/loans/LoanCard";
import { Empty, PageHeader, Section, Skeleton } from "@/components/ui";

function AllLoans() {
  const loans = useQuery(api.loans.all);
  if (loans === undefined) return <Skeleton />;
  if (loans.length === 0) return <Empty title="No loans yet" />;
  return (
    <ul className="grid gap-3">
      {loans.map((loan) => (
        <LoanCard key={loan._id} loan={loan} perspective="admin" />
      ))}
    </ul>
  );
}

export default function AdminPage() {
  const me = useQuery(api.users.me);
  // Hiding the page is a convenience: every admin query re-checks the role
  // in Convex, so a non-admin who opens this URL gets an error, not data.
  if (me === undefined) return <Skeleton />;
  if (me?.role !== "admin") return <Empty title="This area is for admins" />;

  return (
    <>
      <PageHeader title="Admin" subtitle="Moderate listings from All tools; manage lenders and loans here." />
      <Section title="Automation health">
        <HealthPanel />
      </Section>
      <Section title="Lenders">
        <LendersTable />
      </Section>
      <Section title="All loans">
        <AllLoans />
      </Section>
    </>
  );
}
