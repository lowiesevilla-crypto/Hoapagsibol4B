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

  // The feature flag only controls the existing advanced/durable progress
  // workflow. Basic immediate feedback and duplicate-click protection remain
  // available even when that workflow is disabled, so business logic and form
  // actions do not need to change just to make the first click visible.
  const advancedProcessing = enabled && confirmedProcessing;
  const completed = enabled && success;
  const processing = accepted || pending || advancedProcessing;

  return <button
    type="submit"
    className={className}
    disabled={disabled || accepted || pending || advancedProcessing || completed}
    aria-busy={processing || undefined}
    onClick={(event) => {
      const form = event.currentTarget.form;
      if (form && !form.checkValidity()) return;
      if (!lock.current.acquire()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Keep the synchronous lock authoritative for rapid repeat clicks, then
      // render the disabled loading state on the next frame. Deferring the
      // state update preserves the browser's native submit default action for
      // server-action forms while still making feedback visible immediately.
      window.requestAnimationFrame(() => setAccepted(true));
    }}
  >
    {completed
      ? <><Check className="size-4" aria-hidden="true" /> <span role="status" aria-live="polite" aria-atomic="true">{pendingLabel} complete</span></>
      : processing
        ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> <span role="status" aria-live="polite" aria-atomic="true">{pendingLabel}…</span></>
        : children}
  </button>;
}
