"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

export function DocumentReviewActions({ generated = false }: { generated?: boolean }) {
  const operation = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();
  const choose = (value: "review" | "approve" | "reject" | "regenerate", message?: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (message && !window.confirm(message)) { event.preventDefault(); return; }
    if (operation.current) operation.current.value = value;
  };
  return <div className="flex flex-wrap gap-2">
    <input ref={operation} type="hidden" name="operation" defaultValue={generated ? "regenerate" : "review"} />
    {generated ? <button type="submit" className="btn-primary" disabled={pending} onClick={choose("regenerate", "Save these changes and regenerate the active document? The current version will remain archived.")}>{pending ? "Working..." : "Save & regenerate"}</button> : <>
    <button type="submit" className="btn-secondary" disabled={pending} onClick={choose("review")}>{pending ? "Working..." : "Save review"}</button>
    <button type="submit" className="btn-primary" disabled={pending} onClick={choose("approve", "Approve and generate this official document now?")}>{pending ? "Working..." : "Approve & generate"}</button>
    <button type="submit" formNoValidate className="btn-danger" disabled={pending} onClick={choose("reject", "Reject this request? A rejection reason is required.")}>{pending ? "Working..." : "Reject request"}</button>
    </>}
  </div>;
}
