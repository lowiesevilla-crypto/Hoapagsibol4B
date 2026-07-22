"use client";

import { useState } from "react";

type WorkflowPreset = "FREE_INSTANT" | "FREE_APPROVAL" | "PAID_INSTANT" | "PAID_APPROVAL" | "REQUEST_ONLY";

const workflowLabels: Record<WorkflowPreset, string> = {
  FREE_INSTANT: "Free + Instant",
  FREE_APPROVAL: "Free + Approval",
  PAID_INSTANT: "Paid + Instant",
  PAID_APPROVAL: "Paid + Approval",
  REQUEST_ONLY: "Request Only",
};

const workflowExplanations: Record<WorkflowPreset, string> = {
  FREE_INSTANT: "Available immediately after a valid request.",
  FREE_APPROVAL: "No payment required. Admin approval is required.",
  PAID_INSTANT: "Payment is required. No admin approval after payment.",
  PAID_APPROVAL: "Payment and admin approval are both required.",
  REQUEST_ONLY: "The request is recorded for manual processing.",
};

const effectiveRules: Record<WorkflowPreset, Array<[string, string]>> = {
  FREE_INSTANT: [
    ["Requires Payment", "No"],
    ["Requires Approval", "No"],
    ["Auto-Generate Without Approval", "Yes"],
    ["Auto-Generate After Payment", "No"],
    ["Receipt Required", "No"],
    ["Delivery Mode", "Instant Download"],
  ],
  FREE_APPROVAL: [
    ["Requires Payment", "No"],
    ["Requires Approval", "Yes"],
    ["Auto-Generate Without Approval", "No"],
    ["Auto-Generate After Payment", "No"],
    ["Receipt Required", "No"],
    ["Delivery Mode", "Approval Required"],
  ],
  PAID_INSTANT: [
    ["Requires Payment", "Yes"],
    ["Requires Approval", "No"],
    ["Auto-Generate Without Approval", "No"],
    ["Auto-Generate After Payment", "Yes"],
    ["Receipt Required", "Yes when receipt-required is enabled"],
    ["Delivery Mode", "Payment Required"],
  ],
  PAID_APPROVAL: [
    ["Requires Payment", "Yes"],
    ["Requires Approval", "Yes"],
    ["Auto-Generate Without Approval", "No"],
    ["Auto-Generate After Payment", "Waits for approval"],
    ["Receipt Required", "Yes when receipt-required is enabled"],
    ["Delivery Mode", "Payment and Approval Required"],
  ],
  REQUEST_ONLY: [
    ["Requires Payment", "No by default"],
    ["Requires Approval", "Yes"],
    ["Auto-Generate Without Approval", "No"],
    ["Auto-Generate After Payment", "No"],
    ["Receipt Required", "No"],
    ["Delivery Mode", "Request Only"],
  ],
};

export function DocumentDefinitionWorkflowControls({ defaultPreset, defaultFeeAmount }: { defaultPreset: WorkflowPreset; defaultFeeAmount: string }) {
  const [preset, setPreset] = useState<WorkflowPreset>(defaultPreset);
  const [feeAmount, setFeeAmount] = useState(defaultFeeAmount);
  const paid = preset === "PAID_INSTANT" || preset === "PAID_APPROVAL";
  return <>
    <label>
      <span className="label">Workflow</span>
      <select className="field" name="workflowPreset" value={preset} onChange={(event) => setPreset(event.currentTarget.value as WorkflowPreset)}>
        {Object.entries(workflowLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <label>
      <span className="label">Fee amount</span>
      {!paid && <input type="hidden" name="feeAmount" value="0.00" />}
      <input className="field" name={paid ? "feeAmount" : undefined} type="number" min={paid ? 0.01 : 0} step="0.01" required={paid} disabled={!paid} value={paid ? feeAmount : "0.00"} onChange={(event) => setFeeAmount(event.currentTarget.value)} />
      <span className="mt-1 block text-xs font-semibold text-slate-500">{paid ? "Payment is required before this document can proceed." : "This workflow does not require payment."}</span>
    </label>
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950 md:col-span-2">
      {workflowExplanations[preset]}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm md:col-span-2 xl:col-span-4">
      <h3 className="font-black">Resolved effective rules</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {effectiveRules[preset].map(([label, value]) => <div className="rounded-xl bg-slate-50 p-3" key={label}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>)}
      </div>
    </div>
  </>;
}
