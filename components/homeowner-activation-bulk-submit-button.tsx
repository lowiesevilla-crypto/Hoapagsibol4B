"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  intent: "firstTime:selected" | "firstTime:filtered" | "reissue:selected";
  message: string;
  className?: string;
  pendingLabel?: string;
  disabled?: boolean;
};

export function HomeownerActivationBulkSubmitButton({
  children,
  intent,
  message,
  className = "btn-primary",
  pendingLabel = "Queueing activation job",
  disabled = false,
}: Props) {
  const { pending } = useFormStatus();
  const [accepted, setAccepted] = useState(false);
  const sawPending = useRef(false);
  const locked = useRef(false);

  useEffect(() => {
    if (pending) {
      sawPending.current = true;
      return;
    }
    if (!sawPending.current) return;
    sawPending.current = false;
    locked.current = false;
    setAccepted(false);
  }, [pending]);

  const processing = pending || accepted;
  return <button
    type="submit"
    name="intent"
    value={intent}
    className={className}
    disabled={disabled || processing}
    aria-busy={processing || undefined}
    onClick={(event) => {
      if (!window.confirm(message)) {
        event.preventDefault();
        return;
      }
      if (locked.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      locked.current = true;
      window.requestAnimationFrame(() => setAccepted(true));
    }}
  >
    {processing
      ? <><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> <span role="status" aria-live="polite">{pendingLabel}…</span></>
      : children}
  </button>;
}
