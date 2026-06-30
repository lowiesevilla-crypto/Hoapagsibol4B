"use client";

import { useState } from "react";
import { generateManualDocumentAction } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

type Choice = { id: string; label: string };
export function ManualDocumentForm({ homeowners, officers, templates }: { homeowners: Choice[]; officers: Choice[]; templates: Array<{ value: string; label: string }> }) {
  const [type, setType] = useState(templates[0]?.value || "CERTIFICATE_OF_RESIDENCY"); const pass = type === "GATE_PASS" || type === "MOVE_IN_OUT_PASS";
  return <form action={generateManualDocumentAction} className="card max-w-5xl"><div className="mb-6"><h2 className="text-lg font-black">Walk-in / office document generation</h2><p className="text-sm text-slate-500">Generation creates a request record, version archive, QR verification, audit entry, and homeowner history automatically.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <Field label="Homeowner"><select className="field" name="homeownerId" required><option value="">Select homeowner</option>{homeowners.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
    <Field label="Document type"><select className="field" name="type" value={type} onChange={(event) => setType(event.target.value)}>{templates.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
    <Field label="Validity date"><input className="field" type="date" name="validityDate" required={pass} /></Field><Field label="Purpose"><input className="field" name="purpose" required /></Field><Field label="Property information"><input className="field" name="propertyDetails" /></Field><Officer label="Approving officer" name="approvedByOfficerId" officers={officers} /><Officer label="Processed by" name="processedByOfficerId" officers={officers} />
    {pass && <><Field label="Scheduled date"><input className="field" type="date" name="scheduledDate" required /></Field><Field label="Start time"><input className="field" type="time" name="startTime" required /></Field><Field label="End time"><input className="field" type="time" name="endTime" required /></Field>{type === "MOVE_IN_OUT_PASS" && <Field label="Pass type"><select className="field" name="passType"><option value="MOVE_IN">Move-In</option><option value="MOVE_OUT">Move-Out</option></select></Field>}<Field label="Visitor / moving party"><input className="field" name="partyName" required /></Field><Field label="Driver / representative"><input className="field" name="representativeName" /></Field><Field label="Vehicle / truck information"><input className="field" name="vehicleDetails" /></Field><Field label="Contractor / mover"><input className="field" name="contractorDetails" /></Field></>}
    <label className="md:col-span-2 xl:col-span-3"><span className="label">Remarks</span><textarea className="field min-h-24" name="remarks" /></label>
  </div><div className="mt-6"><SubmitButton>Generate official document</SubmitButton></div></form>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label><span className="label">{label}</span>{children}</label>; }
function Officer({ label, name, officers }: { label: string; name: string; officers: Choice[] }) { return <Field label={label}><select className="field" name={name}><option value="">Current administrator</option>{officers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>; }
