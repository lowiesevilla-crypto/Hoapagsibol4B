"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export function DocumentReviewActions({ generated = false }: { generated?: boolean }) {
  const operation = useRef<HTMLInputElement>(null);
  const [showReject, setShowReject] = useState(false);
  const { pending } = useFormStatus();
  const choose = (value: "review" | "approve" | "reject" | "regenerate", message?: string) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (message && !window.confirm(message)) { event.preventDefault(); return; }
    if (operation.current) operation.current.value = value;
  };
  const openReject = () => {
    if (operation.current) operation.current.value = "reject";
    setShowReject(true);
  };
  const cancelReject = () => {
    if (operation.current) operation.current.value = generated ? "regenerate" : "review";
    setShowReject(false);
  };
  return <div className="space-y-3">
    <input ref={operation} type="hidden" name="operation" defaultValue={generated ? "regenerate" : "review"} />
    {generated ? <div className="flex flex-wrap gap-2"><button type="submit" className="btn-primary" disabled={pending} onClick={choose("regenerate", "Save these changes and regenerate the active document? The current version will remain archived.")}>{pending ? "Working..." : "Save & regenerate"}</button></div> : <>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-secondary" disabled={pending} onClick={choose("review")}>{pending ? "Working..." : "Save review"}</button>
        <button type="submit" className="btn-primary" disabled={pending} onClick={choose("approve", "Approve and generate this official document now?")}>{pending ? "Working..." : "Approve & generate"}</button>
        <button type="button" className="btn-danger" disabled={pending} onClick={openReject} aria-expanded={showReject} aria-controls="document-rejection-panel">{pending ? "Working..." : "Reject request"}</button>
      </div>
      {showReject && <div id="document-rejection-panel" role="group" aria-labelledby="document-rejection-heading" className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
        <h3 id="document-rejection-heading" className="font-black text-rose-950">Reject request</h3>
        <label className="mt-3 block">
          <span className="label text-rose-950">Rejection Remarks *</span>
          <textarea className="field min-h-28 border-rose-200 bg-white" name="rejectionRemarks" minLength={10} maxLength={1000} required aria-describedby="document-rejection-help" />
        </label>
        <p id="document-rejection-help" className="mt-2 text-xs font-semibold text-rose-800">Explain why this request is being rejected. Minimum 10 characters, maximum 1,000.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={pending} onClick={cancelReject}>Cancel</button>
          <button type="submit" className="btn-danger" disabled={pending} onClick={choose("reject", "Reject this request and save the rejection remarks?")}>{pending ? "Rejecting..." : "Confirm Rejection"}</button>
        </div>
      </div>}
    </>}
  </div>;
}
