import type { LoanStatus } from "@convex/lib/constants";
import { formatDate, timeAgo } from "@/lib/format";

const base = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

const TONES = {
  green: "bg-accent-soft text-accent ring-accent-line",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  grey: "bg-stone-100 text-stone-600 ring-stone-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
} as const;
type Tone = keyof typeof TONES;

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`${base} ${TONES[tone]}`}>{children}</span>;
}

const STATUS: Record<LoanStatus, { tone: Tone; label: string }> = {
  pending: { tone: "amber", label: "Pending" },
  approved: { tone: "green", label: "On loan" },
  declined: { tone: "grey", label: "Declined" },
  cancelled: { tone: "grey", label: "Withdrawn" },
  returned: { tone: "blue", label: "Returned" },
};

export function StatusBadge({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue) return <Badge tone="red">Overdue</Badge>;
  const { tone, label } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

type Availability =
  | { state: "available" }
  | { state: "on_loan"; until: string; overdue: boolean };

export function AvailabilityBadge({ availability }: { availability: Availability }) {
  if (availability.state === "available") return <Badge tone="green">Available</Badge>;
  if (availability.overdue) return <Badge tone="red">Overdue</Badge>;
  return <Badge tone="amber">Out until {formatDate(availability.until)}</Badge>;
}

export function TrustedBadge() {
  return <span className="font-medium text-accent">✓ Trusted Lender</span>;
}

type Activity = { kind: string; detail: string; at: number } | null;

/** The automation activity line under each loan. */
export function ActivityLine({ activity }: { activity: Activity }) {
  if (!activity) return null;
  const failed = activity.kind.endsWith("failed");
  const waiting = activity.kind === "retrying" || activity.kind === "skipped";
  const dot = failed ? "bg-red-500" : waiting ? "bg-amber-500" : "bg-accent";
  return (
    <p className={`mt-2 flex items-center gap-1.5 text-xs ${failed ? "text-red-700" : "text-muted"}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span>
        {activity.detail}
        {activity.kind !== "retrying" && <> · {timeAgo(activity.at)}</>}
      </span>
    </p>
  );
}
