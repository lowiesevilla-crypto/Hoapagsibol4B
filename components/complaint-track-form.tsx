"use client";

import { useActionState } from "react";
import type { ComplaintStatus } from "@prisma/client";
import { SubmitButton } from "@/components/ui";
import { trackComplaintAction } from "@/lib/actions/complaints";
import { shortDate } from "@/lib/utils";

type ComplaintTrackState = {
  status: "idle" | "success" | "error";
  message: string;
  complaint?: {
    publicReference: string;
    title: string;
    requestedAction: string | null;
    status: ComplaintStatus;
    submittedAt: Date;
    updatedAt: Date;
    messages: Array<{ body: string | null; createdAt: Date; authorDisplayName: string | null }>;
  };
};

const initialState: ComplaintTrackState = { status: "idle", message: "" };

export function ComplaintTrackForm() {
  const [state, action] = useActionState(trackComplaintAction, initialState);
  return <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
    <form action={action} className="card space-y-4">
      <label><span className="label">Tracking code</span><input className="field font-mono uppercase" name="trackingCode" placeholder="ANON-..." required /></label>
      <label><span className="label">PIN</span><input className="field font-mono" name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /></label>
      {state.status === "error" && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{state.message}</p>}
      <SubmitButton>Track complaint</SubmitButton>
    </form>
    <section className="card">
      {!state.complaint ? <div className="py-12 text-center text-sm text-slate-500">Enter your tracking code and PIN to view public case updates.</div> : <article>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="font-mono text-xs font-bold text-slate-500">{state.complaint.publicReference}</p><h2 className="text-xl font-black">{state.complaint.title}</h2><p className="text-sm text-slate-500">Submitted {shortDate(state.complaint.submittedAt)} | Updated {shortDate(state.complaint.updatedAt)}</p></div>
          <span className="badge badge-info">{complaintStatusLabel(state.complaint.status)}</span>
        </div>
        <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-black">Requested action</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{state.complaint.requestedAction || "Not provided"}</p></div>
        <div className="mt-5 space-y-3">
          {state.complaint.messages.map((message, index) => <div key={`${message.createdAt.toISOString()}-${index}`} className="rounded-xl bg-slate-50 p-3 text-sm"><p className="font-bold">{message.authorDisplayName || "HOA update"} <span className="font-normal text-slate-500">- {shortDate(message.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-slate-700">{message.body}</p></div>)}
        </div>
      </article>}
    </section>
  </div>;
}

function complaintStatusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
