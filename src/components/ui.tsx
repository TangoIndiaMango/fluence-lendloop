"use client";

import { useState, type ReactNode } from "react";
import { errorMessage, timeAgo } from "@/lib/format";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card py-10 text-center text-sm text-muted">{children}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card h-24 animate-pulse bg-[#f3f0ea]" />
      ))}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-accent-soft text-accent ring-[#c7dfd2]",
  declined: "bg-stone-100 text-stone-600 ring-stone-200",
  cancelled: "bg-stone-100 text-stone-600 ring-stone-200",
  returned: "bg-sky-50 text-sky-800 ring-sky-200",
  overdue: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const key = overdue ? "overdue" : status;
  const label = overdue ? "overdue" : status === "approved" ? "on loan" : status;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[key]}`}>
      {label}
    </span>
  );
}

/** The "automation activity" line under each loan. */
export function ActivityLine({ activity }: { activity: { kind: string; detail: string; at: number } | null }) {
  if (!activity) return null;
  const failed = activity.kind.endsWith("failed");
  const retrying = activity.kind === "retrying";
  return (
    <p className={`mt-2 flex items-center gap-1.5 text-xs ${failed ? "text-red-700" : "text-muted"}`}>
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-red-500" : retrying ? "bg-amber-500" : "bg-accent"}`}
      />
      <span>
        {activity.detail}
        {!retrying && <> · {timeAgo(activity.at)}</>}
      </span>
    </p>
  );
}

/** Button that runs an async action, disables itself, and surfaces errors. */
export function ActionButton({
  onAction,
  children,
  variant = "secondary",
  confirm,
}: {
  onAction: () => Promise<unknown>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className={`btn-${variant}`}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(null);
          try {
            await onAction();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
