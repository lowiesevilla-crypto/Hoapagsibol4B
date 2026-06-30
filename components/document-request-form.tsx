"use client";

import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { submitDocumentRequestAction } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

const types = [
  ["CERTIFICATE_OF_RESIDENCY", "Certificate of Residency"], ["CERTIFICATE_OF_GOOD_STANDING", "Certificate of Good Standing"],
  ["CLEARANCE_CERTIFICATE", "Clearance Certificate"], ["PAYMENT_CERTIFICATION", "Payment Certification"],
  ["CONSTRUCTION_BOND_CERTIFICATION", "Construction Bond Certification"], ["CONTRACTOR_BOND_CERTIFICATION", "Contractor Bond Certification"],
  ["GATE_PASS", "Gate Pass"], ["MOVE_IN_OUT_PASS", "Move In / Move Out Pass"],
] as const;

export function DocumentRequestForm({ disabled = false }: { disabled?: boolean }) {
  const [type, setType] = useState<string>(types[0][0]);
  const isPass = type === "GATE_PASS" || type === "MOVE_IN_OUT_PASS";
  return <form action={submitDocumentRequestAction} className="card">
    <h2 className="text-lg font-black">Request an HOA document</h2><p className="mb-5 text-sm text-slate-500">Requests are reviewed by the HOA office. Generated documents include an online verification code.</p>
    <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2 disabled:opacity-60">
      <div className="md:col-span-2"><label className="label">Document type</label><select className="field" name="type" value={type} onChange={(event) => setType(event.target.value as typeof type)}>{types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="md:col-span-2"><label className="label">Purpose</label><textarea className="field min-h-24" name="purpose" maxLength={500} placeholder="Why do you need this document?" required /></div>
      {isPass && <>
        {type === "MOVE_IN_OUT_PASS" && <div><label className="label">Pass type</label><select className="field" name="passType" required><option value="MOVE_IN">Move In</option><option value="MOVE_OUT">Move Out</option></select></div>}
        <div><label className="label">Scheduled date</label><input className="field" name="scheduledDate" type="date" min={new Date().toISOString().slice(0, 10)} required /></div>
        <div><label className="label">Start time</label><input className="field" name="startTime" type="time" required /></div>
        <div><label className="label">End time</label><input className="field" name="endTime" type="time" required /></div>
        <div className="md:col-span-2"><label className="label">Authorized person / moving party</label><input className="field" name="partyName" maxLength={200} required /></div>
        <div><label className="label">Driver / representative</label><input className="field" name="representativeName" maxLength={200} /></div>
        <div><label className="label">Contractor / mover</label><input className="field" name="contractorDetails" maxLength={300} /></div>
        <div className="md:col-span-2"><label className="label">Property / unit details</label><input className="field" name="propertyDetails" maxLength={300} placeholder="Defaults to your registered property address" /></div>
        <div className="md:col-span-2"><label className="label">Vehicle, items, or cargo details</label><textarea className="field min-h-20" name="vehicleDetails" maxLength={1000} /></div>
      </>}
      {type === "CONTRACTOR_BOND_CERTIFICATION" && <div className="md:col-span-2"><label className="label">Contractor details</label><textarea className="field min-h-20" name="contractorDetails" maxLength={1000} placeholder="Contractor/company name and relevant project" /></div>}
      <div className="md:col-span-2"><label className="label">Additional remarks</label><textarea className="field min-h-20" name="remarks" maxLength={1000} /></div>
      <div className="md:col-span-2"><SubmitButton><FilePlus2 className="size-4" /> Submit request</SubmitButton></div>
    </fieldset>
  </form>;
}
