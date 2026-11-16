"use client";

import { useState } from "react";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@convex/lib/constants";
import { errorMessage } from "@/lib/format";
import { ErrorText } from "./ui";

export type ToolInput = { name: string; category: Category; condition: Condition; description: string };

export function ToolForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolInput;
  submitLabel: string;
  onSubmit: (input: ToolInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ToolInput>(
    initial ?? { name: "", category: "Power tools", condition: "good", description: "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof ToolInput>(k: K, v: ToolInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(form);
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <label>
        <span className="label">Name</span>
        <input
          className="input"
          required
          minLength={2}
          maxLength={LIMITS.toolName}
          placeholder="e.g. Cordless drill (18V)"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Category</span>
          <select className="input" value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Condition</span>
          <select
            className="input capitalize"
            value={form.condition}
            onChange={(e) => set("condition", e.target.value as Condition)}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <span className="label">
          Short description <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea
          className="input"
          rows={3}
          maxLength={LIMITS.toolDescription}
          placeholder="Two batteries and a charger included. Please return charged."
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <span className="mt-1 block text-right text-xs text-muted">
          {form.description.length}/{LIMITS.toolDescription}
        </span>
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
