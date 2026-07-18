"use client";

import { useState } from "react";
import { generateManualDocumentAction } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

type Choice = { id: string; label: string };
type DefinitionChoice = {
  id: string;
  label: string;
  workflow: string;
  fee: string;
  balancePolicy: string;
  approvalRequired: boolean;
  walkInEnabled: boolean;
  template: string;
  nextStep: string;
};

export function ManualDocumentForm({ homeowners, officers, definitions }: { homeowners: Choice[]; officers: Choice[]; definitions: DefinitionChoice[] }) {
  const [definitionId, setDefinitionId] = useState(definitions[0]?.id || "");
  const selected = definitions.find((definition) => definition.id === definitionId);
  const pass = selected?.label.toLowerCase().includes("pass") || false;
  return <form action={generateManualDocumentAction} className="card max-w-5xl">
    <div className="mb-6"><h2 className="text-lg font-black">Walk-In / Office Request</h2><p className="text-sm text-slate-500">Create a tenant-scoped document request for an office-assisted transaction. The next step follows the selected document workflow.</p></div>
    {!definitions.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">No walk-in document types are currently available. Review Document Type configuration, template publication, and Walk-In availability.</div> : <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Homeowner"><select className="field" name="homeownerId" required><option value="">Select homeowner</option>{homeowners.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="Document type"><select className="field" name="definitionId" value={definitionId} onChange={(event) => setDefinitionId(event.target.value)} required>{definitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
        <Field label="Validity date"><input className="field" type="date" name="validityDate" required={pass} /></Field>
        <Field label="Purpose"><input className="field" name="purpose" required /></Field>
        <Field label="Property information"><input className="field" name="propertyDetails" /></Field>
        <Officer label="Approving officer" name="approvedByOfficerId" officers={officers} />
        <Officer label="Processed by" name="processedByOfficerId" officers={officers} />
        {pass && <><Field label="Scheduled date"><input className="field" type="date" name="scheduledDate" required /></Field><Field label="Start time"><input className="field" type="time" name="startTime" required /></Field><Field label="End time"><input className="field" type="time" name="endTime" required /></Field><Field label="Pass type"><select className="field" name="passType"><option value="MOVE_IN">Move-In</option><option value="MOVE_OUT">Move-Out</option></select></Field><Field label="Visitor / moving party"><input className="field" name="partyName" required /></Field><Field label="Driver / representative"><input className="field" name="representativeName" /></Field><Field label="Vehicle / truck information"><input className="field" name="vehicleDetails" /></Field><Field label="Contractor / mover"><input className="field" name="contractorDetails" /></Field></>}
        <label className="md:col-span-2 xl:col-span-3"><span className="label">Remarks</span><textarea className="field min-h-24" name="remarks" /></label>
      </div>
      {selected && <section className="mt-6 rounded-2xl border border-pine-200 bg-pine-50 p-4" aria-live="polite"><h3 className="font-black">Request policy summary</h3><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Summary label="Document type" value={selected.label} /><Summary label="Workflow" value={selected.workflow} /><Summary label="Fee" value={selected.fee} /><Summary label="Balance policy" value={selected.balancePolicy} /><Summary label="Approval" value={selected.approvalRequired ? "Required" : "Not required"} /><Summary label="Walk-In availability" value={selected.walkInEnabled ? "Enabled" : "Disabled"} /><Summary label="Published template" value={selected.template} /><Summary label="Expected next step" value={selected.nextStep} /></div></section>}
      <div className="mt-6"><SubmitButton>{selected?.nextStep || "Create request"}</SubmitButton></div>
    </>}
  </form>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="label">{label}</span>{children}</label>; }
function Officer({ label, name, officers }: { label: string; name: string; officers: Choice[] }) { return <Field label={label}><select className="field" name={name}><option value="">Current administrator</option>{officers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-black text-slate-900">{value}</p></div>; }
