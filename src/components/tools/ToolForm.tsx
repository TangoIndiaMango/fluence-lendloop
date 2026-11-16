"use client";

import { useState } from "react";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@convex/lib/constants";
import { ErrorText, Field, FormActions } from "@/components/ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { capitalise } from "@/lib/format";

export type ToolInput = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolInput = { name: "", category: "Power tools", condition: "good", description: "" };

export function ToolForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolInput;
  submitLabel: string;
  onSubmit: (input: ToolInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ToolInput>(initial);
  const { run, busy, error } = useAsyncAction(onSubmit);
  const set = <K extends keyof ToolInput>(key: K, value: ToolInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(form);
      }}
    >
      <Field label="Name">
        <input
          className="input"
          required
          autoFocus
          minLength={2}
          maxLength={LIMITS.toolName}
          placeholder="e.g. Cordless drill (18V)"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <select className="input" value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Condition">
          <select className="input" value={form.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {capitalise(c)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Short description" optional hint={`${form.description.length}/${LIMITS.toolDescription}`}>
        <textarea
          className="input"
          rows={3}
          maxLength={LIMITS.toolDescription}
          placeholder="Two batteries and a charger included. Please return charged."
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <FormActions busy={busy} submitLabel={submitLabel} busyLabel="Saving…" onCancel={onCancel} />
    </form>
  );
}
