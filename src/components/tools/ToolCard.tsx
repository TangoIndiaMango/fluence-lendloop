"use client";

import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import type { api } from "@convex/_generated/api";
import { RequestForm } from "@/components/loans/RequestForm";
import { ToolImage } from "./CategoryArt";
import { ActionButton, AvailabilityBadge, TrustedBadge } from "@/components/ui";
import { formatRange } from "@/lib/format";

export type BrowseTool = FunctionReturnType<typeof api.tools.list>[number];

export function ToolCard({
  tool,
  canModerate,
  onRemove,
}: {
  tool: BrowseTool;
  canModerate: boolean;
  onRemove: () => Promise<unknown>;
}) {
  const [stage, setStage] = useState<"idle" | "requesting" | "sent">("idle");
  const { booked } = tool.availability;

  return (
    <li className="card flex flex-col overflow-hidden">
      <ToolImage
        src={tool.imageUrl}
        category={tool.category}
        name={tool.name}
        className="-mx-4 -mt-4 mb-3 h-36 w-[calc(100%+2rem)] max-w-none"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{tool.name}</h2>
          <p className="text-xs text-muted">
            {tool.category} · {tool.condition} condition
          </p>
        </div>
        <AvailabilityBadge availability={tool.availability} />
      </div>
      {tool.description && <p className="mt-2 text-sm">{tool.description}</p>}
      <p className="mt-2 text-xs text-muted">
        Lent by {tool.isMine ? "you" : tool.ownerFirstName}
        {tool.ownerTrusted && (
          <span className="ml-1.5">
            <TrustedBadge />
          </span>
        )}
      </p>
      {booked.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Booked: {booked.map((b) => formatRange(b.startDate, b.endDate)).join(", ")}
        </p>
      )}

      {stage === "requesting" ? (
        <RequestForm toolId={tool._id} booked={booked} onDone={(sent) => setStage(sent ? "sent" : "idle")} />
      ) : (
        <div className="mt-auto flex flex-wrap items-start gap-2 pt-3">
          {!tool.isMine && (
            <button className="btn-secondary" onClick={() => setStage("requesting")}>
              Request to borrow
            </button>
          )}
          {canModerate && !tool.isMine && (
            <ActionButton
              variant="danger"
              confirm={{ prompt: "Remove for everyone?", confirmLabel: "Remove" }}
              onAction={onRemove}
            >
              Remove (admin)
            </ActionButton>
          )}
        </div>
      )}
      {stage === "sent" && (
        <p className="mt-2 text-sm text-accent" role="status">
          Request sent. Track it in{" "}
          <Link className="focus-ring rounded underline" href="/requests">
            My requests
          </Link>
          .
        </p>
      )}
    </li>
  );
}
