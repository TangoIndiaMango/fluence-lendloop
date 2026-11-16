"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/lib/constants";
import { errorMessage, todayIso } from "@/lib/format";
import { ErrorText } from "./ui";

export function RequestForm({ toolId, onDone }: { toolId: Id<"tools">; onDone: (sent: boolean) => void }) {
  const request = useMutation(api.loans.request);
  const today = todayIso();
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-3 grid gap-3 border-t border-border pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await request({ toolId, startDate, endDate, message: message || undefined });
          onDone(true);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label">From</span>
          <input
            type="date"
            className="input"
            required
            min={today}
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > endDate) setEnd(e.target.value);
            }}
          />
        </label>
        <label>
          <span className="label">Until</span>
          <input
            type="date"
            className="input"
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      <label>
        <span className="label">
          Note to the lender <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea
          className="input"
          rows={2}
          maxLength={LIMITS.requestMessage}
          placeholder="e.g. Putting up shelves on Saturday"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => onDone(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
