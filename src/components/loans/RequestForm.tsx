"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LIMITS } from "@convex/lib/constants";
import { ErrorText, Field, FormActions } from "@/components/ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatRange, plural, todayIso } from "@/lib/format";

type Range = { startDate: string; endDate: string };

function daysInclusive({ startDate, endDate }: Range) {
  return Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1;
}

export function RequestForm({
  toolId,
  booked,
  onDone,
}: {
  toolId: Id<"tools">;
  booked: Range[];
  onDone: (sent: boolean) => void;
}) {
  const request = useMutation(api.loans.request);
  const today = todayIso();
  const [range, setRange] = useState<Range>({ startDate: today, endDate: today });
  const [message, setMessage] = useState("");
  const { run, busy, error } = useAsyncAction(() =>
    request({ toolId, ...range, message: message.trim() || undefined }),
  );

  // Instant feedback for the common mistake; the server still re-checks.
  const clash = booked.find((b) => range.startDate <= b.endDate && b.startDate <= range.endDate);
  const days = daysInclusive(range);
  const tooLong = days > LIMITS.maxLoanDays;

  return (
    <form
      className="mt-3 grid gap-3 border-t border-border pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run()) onDone(true);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="From">
          <input
            type="date"
            className="input"
            required
            min={today}
            value={range.startDate}
            onChange={(e) => {
              const startDate = e.target.value;
              setRange((r) => ({ startDate, endDate: r.endDate < startDate ? startDate : r.endDate }));
            }}
          />
        </Field>
        <Field label="Until">
          <input
            type="date"
            className="input"
            required
            min={range.startDate}
            value={range.endDate}
            onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
          />
        </Field>
      </div>
      <p className={`text-xs ${clash || tooLong ? "text-red-700" : "text-muted"}`} aria-live="polite">
        {clash
          ? `Already booked ${formatRange(clash.startDate, clash.endDate)}. Pick other dates.`
          : tooLong
            ? `Loans can be at most ${LIMITS.maxLoanDays} days.`
            : plural(days, "day")}
      </p>
      <Field label="Note to the lender" optional hint={`${message.length}/${LIMITS.requestMessage}`}>
        <textarea
          className="input"
          rows={2}
          maxLength={LIMITS.requestMessage}
          placeholder="e.g. Putting up shelves on Saturday"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <FormActions
        busy={busy}
        submitDisabled={Boolean(clash) || tooLong}
        submitLabel="Send request"
        busyLabel="Sending…"
        onCancel={() => onDone(false)}
      />
    </form>
  );
}
