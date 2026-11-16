"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Skeleton } from "@/components/ui";
import { timeAgo } from "@/lib/format";

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="card">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${alert && value > 0 ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

export function HealthPanel() {
  const health = useQuery(api.automation.health);
  if (health === undefined) return <Skeleton rows={1} />;

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Deliveries waiting or retrying" value={health.pendingDeliveries} />
        <Stat label="Failed after retries" value={health.failedDeliveries.length} alert />
        <Stat label="Workflow errors (recent)" value={health.errors.length} alert />
      </div>
      {health.errors.length > 0 && (
        <ul className="grid gap-1.5 text-sm">
          {health.errors.map((e) => (
            <li key={e._id} className="rounded-lg bg-red-50 px-3 py-2 text-red-800">
              <strong>{e.workflowName}</strong> failed at “{e.nodeName}”: {e.message}{" "}
              <span className="text-red-600/80">· {timeAgo(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
