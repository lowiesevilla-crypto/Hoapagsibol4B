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
  pendingLabel = "Working",
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
    return <button type="submit" className={className} disabled={pending || disabled}>{pending ? "Working..." : children}</button>;
  }

  const percentage = success ? 100 : confirmedProcessing ? 75 : pending ? 50 : accepted ? 25 : 0;
  const processing = percentage > 0 && percentage < 100;

  return <button
    type="submit"
    className={className}
    disabled={disabled || pending || success}
    aria-busy={processing || undefined}
    onClick={(event) => {
      const form = event.currentTarget.form;
      if (form && !form.checkValidity()) return;
      if (!lock.current.acquire()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Keep the synchronous lock authoritative for rapid repeated events, then
      // render the disabled 25% state after the browser dispatches this submit.
      window.requestAnimationFrame(() => setAccepted(true));
    }}
  >
    {success
      ? <><Check className="size-4" aria-hidden="true" /> {pendingLabel} complete · 100%</>
      : processing
        ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> <span role="status" aria-live="polite">{pendingLabel}… {percentage}%</span></>
        : children}
  </button>;
}
