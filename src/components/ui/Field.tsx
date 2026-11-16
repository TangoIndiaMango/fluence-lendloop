import type { ReactNode } from "react";

/** Label + control + optional hint/counter, so every form field looks the same. */
export function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-right text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FormActions({
  busy,
  submitLabel,
  busyLabel,
  onCancel,
  submitDisabled = false,
}: {
  busy: boolean;
  submitLabel: string;
  busyLabel: string;
  onCancel: () => void;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button type="submit" className="btn-primary" disabled={busy || submitDisabled}>
        {busy ? busyLabel : submitLabel}
      </button>
      <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
