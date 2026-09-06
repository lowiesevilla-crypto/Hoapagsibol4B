"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createSubmissionLock } from "@/lib/action-progress/submission-lock";

type ActionProgressButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  enabled?: boolean;
  pendingLabel?: string;
  confirmedProcessing?: boolean;
  success?: boolean;
};

export function ActionProgressButton({
  children,
  className = "btn-primary",
  disabled = false,
  enabled = false,
  pendingLabel = "Processing request",
  confirmedProcessing = false,
  success = false,
}: ActionProgressButtonProps) {
  const { pending } = useFormStatus();
  const lock = useRef(createSubmissionLock());
  const sawPending = useRef(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (pending) {
      sawPending.current = true;
      return;
    }
    if (!sawPending.current) return;
    lock.current.release();
    sawPending.current = false;
    setAccepted(false);
  }, [pending]);

  if (!enabled) {
    return <button type="submit" className={className} disabled={pending || disabled}>{pending ? `${pendingLabel}…` : children}</button>;
  }

  const processing = accepted || pending || confirmedProcessing;

  return <button
    type="submit"
    className={className}
    disabled={disabled || accepted || pending || confirmedProcessing || success}
    aria-busy={processing || undefined}
    onClick={(event) => {
      const form = event.currentTarget.form;
      if (form && !form.checkValidity()) return;
      if (!lock.current.acquire()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Render feedback immediately after the first accepted click. The lock
      // remains synchronous so rapid repeat clicks cannot submit twice before
      // React exposes the form's pending state.
      setAccepted(true);
    }}
  >
    {success
      ? <><Check className="size-4" aria-hidden="true" /> <span role="status" aria-live="polite" aria-atomic="true">{pendingLabel} complete</span></>
      : processing
        ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> <span role="status" aria-live="polite" aria-atomic="true">{pendingLabel}…</span></>
        : children}
  </button>;
}
