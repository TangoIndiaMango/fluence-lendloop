"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  ghost: "btn-ghost",
};

/**
 * Runs an async action with busy and error state. With `confirm`, the
 * button first turns into an inline "Are you sure?" row instead of a
 * blocking browser dialog; focus moves to the safe choice.
 */
export function ActionButton({
  onAction,
  children,
  variant = "secondary",
  busyLabel = "Working…",
  confirm,
}: {
  onAction: () => Promise<unknown>;
  children: ReactNode;
  variant?: Variant;
  busyLabel?: string;
  confirm?: { prompt: string; confirmLabel: string };
}) {
  const { run, busy, error } = useAsyncAction(onAction);
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  if (confirming && confirm) {
    return (
      <span
        role="group"
        aria-label={confirm.prompt}
        className="inline-flex flex-wrap items-center gap-2"
        onKeyDown={(e) => e.key === "Escape" && setConfirming(false)}
      >
        <span className="text-sm">{confirm.prompt}</span>
        <button ref={keepRef} className="btn-secondary" onClick={() => setConfirming(false)} disabled={busy}>
          Keep
        </button>
        <button
          className={VARIANT[variant === "secondary" ? "danger" : variant]}
          disabled={busy}
          onClick={async () => {
            if (await run()) setConfirming(false);
          }}
        >
          {busy ? busyLabel : confirm.confirmLabel}
        </button>
        {error && <span role="alert" className="w-full text-xs text-red-700">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className={VARIANT[variant]}
        disabled={busy}
        aria-busy={busy}
        onClick={() => (confirm ? setConfirming(true) : run())}
      >
        {busy ? busyLabel : children}
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

/** An accessible on/off switch that runs an async action when toggled. */
export function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => Promise<unknown>;
}) {
  const { run, busy, error } = useAsyncAction(onChange);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        onClick={() => run(!checked)}
        className={`focus-ring relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
          checked ? "bg-accent" : "bg-stone-300"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
