"use client";

import { useMemo, useState } from "react";
import type { DocumentDeliveryMode } from "@prisma/client";
import type { DocumentWorkflowFields, DocumentWorkflowPreset } from "@/lib/services/document-workflow-presets";

type ApproverUser = { id: string; name: string; role: string };

const workflowLabels: Record<DocumentWorkflowPreset, string> = {
  FREE_INSTANT: "Free + Instant",
  FREE_APPROVAL: "Free + Approval",
  PAID_INSTANT: "Paid + Instant",
  PAID_APPROVAL: "Paid + Approval",
  REQUEST_ONLY: "Request Only",
  CUSTOM: "Custom",
};

const workflowExplanations: Record<DocumentWorkflowPreset, string> = {
  FREE_INSTANT: "No payment and no approval. Document is generated immediately after a valid request.",
  FREE_APPROVAL: "No payment. Authorized approval is required before generation.",
  PAID_INSTANT: "Payment is required. Document is generated automatically after payment confirmation.",
  PAID_APPROVAL: "Payment and approval are required before generation.",
  REQUEST_ONLY: "Request is recorded for manual processing. No automatic issuance.",
  CUSTOM: "Edit payment, approval, receipt, and delivery rules independently.",
};

const presetRules: Record<Exclude<DocumentWorkflowPreset, "CUSTOM">, DocumentWorkflowFields> = {
  FREE_INSTANT: { deliveryMode: "INSTANT_DOWNLOAD" as DocumentDeliveryMode, paymentRequired: false, approvalRequired: false, paymentBeforeApproval: false, allowImmediateDownload: true, requiresAdminReview: false },
  FREE_APPROVAL: { deliveryMode: "APPROVAL_REQUIRED" as DocumentDeliveryMode, paymentRequired: false, approvalRequired: true, paymentBeforeApproval: false, allowImmediateDownload: false, requiresAdminReview: true },
  PAID_INSTANT: { deliveryMode: "PAYMENT_REQUIRED" as DocumentDeliveryMode, paymentRequired: true, approvalRequired: false, paymentBeforeApproval: true, allowImmediateDownload: false, requiresAdminReview: false },
  PAID_APPROVAL: { deliveryMode: "PAYMENT_AND_APPROVAL_REQUIRED" as DocumentDeliveryMode, paymentRequired: true, approvalRequired: true, paymentBeforeApproval: true, allowImmediateDownload: false, requiresAdminReview: true },
  REQUEST_ONLY: { deliveryMode: "REQUEST_ONLY" as DocumentDeliveryMode, paymentRequired: false, approvalRequired: true, paymentBeforeApproval: false, allowImmediateDownload: false, requiresAdminReview: true },
};

const deliveryModeLabels: Record<DocumentDeliveryMode, string> = {
  INSTANT_DOWNLOAD: "Instant Download",
  APPROVAL_REQUIRED: "Admin Release",
  PAYMENT_REQUIRED: "After Payment",
  PAYMENT_AND_APPROVAL_REQUIRED: "Payment and Approval",
  REQUEST_ONLY: "Request Only",
};

export function DocumentDefinitionWorkflowControls({
  defaultPreset,
  defaultFeeAmount,
  defaultRules,
  defaultReceiptRequired,
  defaultAllowPayLater,
  defaultApproverRole,
  defaultApproverUserId,
  approverUsers,
}: {
  defaultPreset: DocumentWorkflowPreset;
  defaultFeeAmount: string;
  defaultRules: DocumentWorkflowFields;
  defaultReceiptRequired: boolean;
  defaultAllowPayLater: boolean;
  defaultApproverRole: string;
  defaultApproverUserId: string;
  approverUsers: ApproverUser[];
}) {
  const [preset, setPreset] = useState<DocumentWorkflowPreset>(defaultPreset);
  const [feeAmount, setFeeAmount] = useState(defaultFeeAmount);
  const [customRules, setCustomRules] = useState<DocumentWorkflowFields>(defaultRules);
  const [receiptRequired, setReceiptRequired] = useState(defaultReceiptRequired);
  const [allowPayLater, setAllowPayLater] = useState(defaultAllowPayLater);
  const rules = useMemo(() => preset === "CUSTOM" ? customRules : presetRules[preset], [preset, customRules]);
  const paid = rules.paymentRequired;
  const approval = rules.approvalRequired || rules.requiresAdminReview;
  const locked = preset !== "CUSTOM";
  const setCustomBoolean = (name: keyof Omit<DocumentWorkflowFields, "deliveryMode">, value: boolean) => setCustomRules((current) => ({ ...current, [name]: value }));

  return <>
    <label>
      <span className="label">Workflow preset</span>
      <select className="field" name="workflowPreset" value={preset} onChange={(event) => setPreset(event.currentTarget.value as DocumentWorkflowPreset)}>
        {Object.entries(workflowLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950 xl:col-span-3">
      {workflowExplanations[preset]} {locked ? "Related rule fields are preset-controlled. Choose Custom to edit them independently." : "Custom mode persists the individual rule fields shown below."}
    </div>
    <input type="hidden" name="paymentRequired" value={String(rules.paymentRequired)} />
    <input type="hidden" name="approvalRequired" value={String(rules.approvalRequired)} />
    <input type="hidden" name="paymentBeforeApproval" value={String(rules.paymentBeforeApproval)} />
    <input type="hidden" name="allowImmediateDownload" value={String(rules.allowImmediateDownload)} />
    <input type="hidden" name="requiresAdminReview" value={String(rules.requiresAdminReview)} />
    <input type="hidden" name="deliveryMode" value={rules.deliveryMode} />
    <input type="hidden" name="receiptRequired" value={String(paid && receiptRequired)} />
    <input type="hidden" name="allowPayLater" value={String(paid && allowPayLater)} />

    <RuleSwitch label="Requires Payment" checked={rules.paymentRequired} disabled={locked} onChange={(value) => setCustomBoolean("paymentRequired", value)} />
    <RuleSwitch label="Requires Approval" checked={rules.approvalRequired} disabled={locked} onChange={(value) => setCustomBoolean("approvalRequired", value)} />
    <RuleSwitch label="Auto-Generate After Payment" checked={rules.paymentBeforeApproval} disabled={locked || !rules.paymentRequired} onChange={(value) => setCustomBoolean("paymentBeforeApproval", value)} />
    <RuleSwitch label="Auto-Generate Without Approval" checked={rules.allowImmediateDownload} disabled={locked || rules.paymentRequired || rules.approvalRequired} onChange={(value) => setCustomBoolean("allowImmediateDownload", value)} />
    <RuleSwitch label="Requires Admin Review" checked={rules.requiresAdminReview} disabled={locked || !rules.approvalRequired} onChange={(value) => setCustomBoolean("requiresAdminReview", value)} />
    <label>
      <span className="label">Delivery mode</span>
      <select className="field" value={rules.deliveryMode} disabled={locked} onChange={(event) => setCustomRules((current) => ({ ...current, deliveryMode: event.currentTarget.value as DocumentDeliveryMode }))}>
        {deliveryModes.map((mode) => <option key={mode} value={mode}>{deliveryModeLabels[mode]}</option>)}
      </select>
      {locked && <span className="mt-1 block text-xs font-semibold text-slate-500">Preset-controlled.</span>}
    </label>
    <label>
      <span className="label">Fee amount</span>
      {!paid && <input type="hidden" name="feeAmount" value="0.00" />}
      <input className="field" name={paid ? "feeAmount" : undefined} type="number" min={paid ? 0.01 : 0} step="0.01" required={paid} disabled={!paid} value={paid ? feeAmount : "0.00"} onChange={(event) => setFeeAmount(event.currentTarget.value)} />
      <span className="mt-1 block text-xs font-semibold text-slate-500">{paid ? "Payment is required before this document can proceed." : "This workflow does not require payment."}</span>
    </label>
    <RuleSwitch label="Receipt Required" checked={paid && receiptRequired} disabled={!paid} onChange={setReceiptRequired} />
    <label>
      <span className="label">Receipt Type</span>
      <input className="field" name="receiptType" value={paid && receiptRequired ? "Other Collection receipt" : "Not applicable"} readOnly aria-readonly="true" />
      <span className="mt-1 block text-xs font-semibold text-slate-500">Document fee collection uses the existing Other Collection receipt path.</span>
    </label>
    <RuleSwitch label="Allow Pay Later" checked={paid && allowPayLater} disabled={!paid} onChange={setAllowPayLater} />
    <label>
      <span className="label">Approver Role</span>
      <select className="field" name="approverRole" defaultValue={approval ? defaultApproverRole : ""} disabled={!approval}>
        <option value="">{approval ? "Any authorized tenant admin" : "Not applicable"}</option>
        {["HOA_ADMIN", "ADMIN", "SYSTEM_ADMIN", "STAFF", "BILLING_MANAGER", "SUPER_ADMIN"].map((role) => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}
      </select>
    </label>
    <label>
      <span className="label">Specific Approver</span>
      <select className="field" name="approverUserId" defaultValue={approval ? defaultApproverUserId : ""} disabled={!approval}>
        <option value="">{approval ? "No specific approver" : "Not applicable"}</option>
        {approverUsers.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.role.replaceAll("_", " ")}</option>)}
      </select>
    </label>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm md:col-span-2 xl:col-span-4">
      <h3 className="font-black">Resolved effective rules</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Rule label="Requires Payment" value={rules.paymentRequired ? "Yes" : "No"} />
        <Rule label="Requires Approval" value={rules.approvalRequired ? "Yes" : "No"} />
        <Rule label="Auto-Generate Without Approval" value={rules.allowImmediateDownload ? "Yes" : "No"} />
        <Rule label="Auto-Generate After Payment" value={rules.paymentRequired && !rules.approvalRequired ? "Yes" : rules.paymentRequired && rules.approvalRequired ? "After approval" : "No"} />
        <Rule label="Receipt Required" value={paid && receiptRequired ? "Yes" : "No"} />
        <Rule label="Delivery Mode" value={deliveryModeLabels[rules.deliveryMode]} />
      </div>
    </div>
  </>;
}

function RuleSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${disabled ? "bg-slate-50 text-slate-500" : "bg-white"}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
    <span>{label}</span>
    {disabled && <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">Preset-controlled</span>}
  </label>;
}

function Rule({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-black text-slate-950">{value}</p></div>;
}
const deliveryModes = ["INSTANT_DOWNLOAD", "APPROVAL_REQUIRED", "PAYMENT_REQUIRED", "PAYMENT_AND_APPROVAL_REQUIRED", "REQUEST_ONLY"] as const;
