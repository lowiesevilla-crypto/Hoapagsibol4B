"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui";
import { submitPortalComplaintAction } from "@/lib/actions/complaints";

type Category = { id: string; name: string };
type ComplaintIntakeState = {
  status: "idle" | "success" | "error";
  message: string;
  complaintId?: string;
  publicReference?: string;
  detailHref?: string;
  trackingCode?: string;
  trackingPin?: string;
};

const initialState: ComplaintIntakeState = { status: "idle", message: "" };

export function ComplaintIntakeForm({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState(submitPortalComplaintAction, initialState);
  return <form action={action} className="card space-y-4" encType="multipart/form-data">
    <div className="grid gap-3 md:grid-cols-2">
      <label><span className="label">Privacy mode</span><select className="field" name="privacyMode" defaultValue="NAMED"><option value="NAMED">Named</option><option value="CONFIDENTIAL">Confidential</option><option value="ANONYMOUS">Anonymous</option></select></label>
      <label><span className="label">Category</span><select className="field" name="categoryId" defaultValue=""><option value="">General / Other</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label><span className="label">Severity</span><select className="field" name="severity" defaultValue="MEDIUM"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
      <label><span className="label">Priority</span><select className="field" name="priority" defaultValue="NORMAL"><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
      <label className="md:col-span-2"><span className="label">Title</span><input className="field" name="title" maxLength={160} required /></label>
      <label><span className="label">Location</span><input className="field" name="location" maxLength={250} /></label>
      <label><span className="label">Incident date</span><input className="field" type="date" name="incidentDate" /></label>
      <label className="md:col-span-2"><span className="label">Details</span><textarea className="field min-h-40" name="description" maxLength={4000} required /></label>
      <label className="md:col-span-2"><span className="label">Requested action</span><textarea className="field min-h-28" name="requestedAction" maxLength={1000} required /></label>
      <label className="md:col-span-2"><span className="label">Attachment</span><input className="field" type="file" name="attachment" accept=".pdf,.jpg,.jpeg,.png" /><span className="mt-1 block text-xs font-semibold text-slate-500">PDF, JPG, JPEG, or PNG up to 10 MB.</span></label>
    </div>
    {state.status === "error" && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{state.message}</p>}
    {state.status === "success" && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
      <p>{state.message}</p>
      {state.publicReference && <div className="mt-3 rounded-lg bg-white p-3"><p className="text-xs uppercase text-slate-500">Reference number</p><p className="font-mono text-lg font-black">{state.publicReference}</p>{state.detailHref && <a className="mt-2 inline-flex text-sm font-black text-pine-700 hover:underline" href={state.detailHref}>View complaint detail</a>}</div>}
      {state.trackingCode && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-3"><p className="text-xs uppercase text-slate-500">Tracking code</p><p className="font-mono text-lg font-black">{state.trackingCode}</p></div>
        <div className="rounded-lg bg-white p-3"><p className="text-xs uppercase text-slate-500">PIN</p><p className="font-mono text-lg font-black">{state.trackingPin}</p></div>
      </div>}
      {state.trackingCode && <p className="mt-3 text-xs font-bold text-amber-900">Save this tracking code and PIN now. The PIN cannot be recovered later.</p>}
    </section>}
    <SubmitButton>Submit complaint</SubmitButton>
  </form>;
}
