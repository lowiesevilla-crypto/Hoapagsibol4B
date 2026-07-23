"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { submitDocumentRequestAction, type DocumentRequestSubmissionState } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

export type PortalDocumentField = {
  key: string;
  label: string;
  fieldType: "TEXT" | "TEXTAREA" | "DATE" | "NUMBER" | "MONEY" | "SELECT" | "CHECKBOX";
  required: boolean;
  defaultValue: string | boolean | null;
  options: Array<{ label: string; value: string }>;
  validation: {
    min?: number | string;
    max?: number | string;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
};

export type PortalDocumentConfig = {
  id: string;
  displayName: string;
  description: string | null;
  feeLabel: string;
  deliveryMode: string;
  summary: string;
  approvalRequired: boolean;
  paymentRequired: boolean;
  maxCopies: number;
  fields: PortalDocumentField[];
};

export type PortalHouseholdMember = {
  id: string;
  fullName: string;
  relationship: string;
  active: boolean;
  eligible: boolean;
  eligibilityLabel: string;
  eligibilityReason: string;
};

const initialSubmissionState: DocumentRequestSubmissionState = { status: "idle", message: "", requestId: null, duplicate: false };

export function DocumentRequestForm({ configs, members, disabled = false }: { configs: PortalDocumentConfig[]; members: PortalHouseholdMember[]; disabled?: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [submissionKey, setSubmissionKey] = useState("");
  const [submissionState, submitAction] = useActionState(submitDocumentRequestAction, initialSubmissionState);
  const [configurationId, setConfigurationId] = useState(configs[0]?.id || "");
  const [subjectType, setSubjectType] = useState<"SELF" | "HOUSEHOLD_MEMBER">("SELF");
  const [subjectMemberId, setSubjectMemberId] = useState("");
  const [memberSectionOpen, setMemberSectionOpen] = useState(false);
  const selected = useMemo(() => configs.find((config) => config.id === configurationId) || configs[0], [configurationId, configs]);
  const eligibleMembers = members.filter((member) => member.eligible);
  useEffect(() => {
    const randomKey = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setSubmissionKey(randomKey);
  }, []);
  useEffect(() => {
    if (submissionState.status === "success" && submissionState.requestId) {
      formRef.current?.reset();
      setSubjectType("SELF");
      setSubjectMemberId("");
      setMemberSectionOpen(false);
      setConfigurationId(configs[0]?.id || "");
      setSubmissionKey(globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
      router.refresh();
    }
  }, [configs, router, submissionState.requestId, submissionState.status]);
  useEffect(() => {
    if (submissionState.status !== "error" || !submissionState.values) return;
    const values = submissionState.values;
    if (values.definitionId) setConfigurationId(values.definitionId);
    if (values.subjectType === "HOUSEHOLD_MEMBER") {
      setSubjectType("HOUSEHOLD_MEMBER");
      setMemberSectionOpen(true);
      setSubjectMemberId(values.subjectMemberId || "");
    }
    errorRef.current?.focus();
  }, [submissionState.status, submissionState.values]);
  useEffect(() => {
    if (subjectType === "HOUSEHOLD_MEMBER") setMemberSectionOpen(true);
  }, [subjectType]);
  if (!selected) return <section className="card"><h2 className="text-lg font-black">Request an HOA document</h2><p className="mt-2 text-sm text-slate-500">No document types are currently available. Please contact the HOA office.</p></section>;
  return <form ref={formRef} action={submitAction} className="card">
    <h2 className="text-lg font-black">Request an HOA document</h2>
    <p className="mb-5 text-sm text-slate-500">Select who the document is for and complete the tenant-required fields.</p>
    {submissionState.status !== "idle" && <p ref={errorRef} tabIndex={-1} role={submissionState.status === "error" ? "alert" : "status"} aria-live="polite" className={`mb-4 rounded-xl p-3 text-sm font-semibold ${submissionState.status === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{submissionState.message}</p>}
    <input type="hidden" name="submissionKey" value={submissionKey} />
    <fieldset disabled={disabled || !submissionKey} className="grid gap-4 md:grid-cols-2 disabled:opacity-60">
      <div className="md:col-span-2">
        <label className="label">Document type</label>
        <select className="field" name="definitionId" value={selected.id} onChange={(event) => setConfigurationId(event.target.value)}>
          {configs.map((config) => <option key={config.id} value={config.id}>{config.displayName}</option>)}
        </select>
        <div className="mt-2 rounded-xl bg-pine-50 p-3 text-sm text-pine-950">
          <b>{selected.summary}</b>
          {selected.description && <p className="mt-1 text-pine-800">{selected.description}</p>}
        </div>
      </div>
      <div className="md:col-span-2">
        <span className="label">Who is this document for?</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 font-bold">
            <input type="radio" name="subjectType" value="SELF" checked={subjectType === "SELF"} onChange={() => setSubjectType("SELF")} />
            Myself
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 font-bold">
            <input type="radio" name="subjectType" value="HOUSEHOLD_MEMBER" checked={subjectType === "HOUSEHOLD_MEMBER"} onChange={() => setSubjectType("HOUSEHOLD_MEMBER")} disabled={eligibleMembers.length === 0} />
            Registered household/family member
          </label>
        </div>
        {members.length > 0 && eligibleMembers.length === 0 && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">No validated and active household member is currently available for document requests. Expand the section below to review what is missing.</p>}
      </div>
      <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left font-black text-slate-900" aria-expanded={memberSectionOpen} aria-controls="household-member-request-panel" onClick={() => setMemberSectionOpen((open) => !open)}>
          <span>Registered Household / Family Members ({members.length})</span>
          <span className="text-xs font-bold text-pine-700">{memberSectionOpen ? "Collapse" : "Expand"}</span>
        </button>
        <div id="household-member-request-panel" hidden={!memberSectionOpen} className="mt-3 space-y-3">
          {subjectType === "HOUSEHOLD_MEMBER" && <div>
            <label className="label">Household/family member</label>
            <select className="field" name="subjectMemberId" required value={subjectMemberId} onChange={(event) => setSubjectMemberId(event.target.value)}>
              <option value="">Select an eligible registered member</option>
              {members.map((member) => <option key={member.id} value={member.id} disabled={!member.eligible}>{member.fullName} - {member.relationship} ({member.eligibilityLabel})</option>)}
            </select>
            {subjectMemberId && <p className="mt-2 rounded-xl bg-white p-3 text-xs font-semibold text-slate-600">{members.find((member) => member.id === subjectMemberId)?.eligibilityReason}</p>}
          </div>}
          <div className="grid gap-2">
            {members.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-slate-500">No household members are registered yet.</p> : members.map((member) => <div key={member.id} className="rounded-xl bg-white p-3 text-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{member.fullName}</p><p className="text-xs text-slate-500">{member.relationship}</p></div><span className={`badge ${member.eligible ? "badge-paid" : "badge-info"} w-fit`}>{member.eligibilityLabel}</span></div><p className="mt-2 text-xs font-semibold text-slate-600">{member.eligibilityReason}</p></div>)}
          </div>
        </div>
      </div>
      <div>
        <label className="label">Number of copies</label>
        <input className="field" name="numberOfCopies" type="number" min={1} max={selected.maxCopies} defaultValue={submissionState.values?.numberOfCopies ?? "1"} />
      </div>
      {selected.fields.map((field) => <ConfiguredField key={`${selected.id}-${field.key}`} field={field} value={submissionState.values?.[`field_${field.key}`]} />)}
      <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row"><SubmitButton><FilePlus2 className="size-4" /> Submit request</SubmitButton><button type="reset" className="btn-secondary" onClick={() => { setSubjectType("SELF"); setSubjectMemberId(""); setMemberSectionOpen(false); }}>Reset</button></div>
    </fieldset>
  </form>;
}

function ConfiguredField({ field, value }: { field: PortalDocumentField; value?: string }) {
  const name = `field_${field.key}`;
  const span = field.fieldType === "TEXTAREA" ? "md:col-span-2" : "";
  const defaultText = value ?? (typeof field.defaultValue === "string" ? field.defaultValue : "");
  if (field.fieldType === "TEXTAREA") return <label className={span}><span className="label">{field.label}</span><textarea className="field min-h-24" name={name} minLength={field.validation.minLength} maxLength={field.validation.maxLength ?? (field.key === "purpose" ? 500 : 1000)} required={field.required} defaultValue={defaultText} /></label>;
  if (field.fieldType === "SELECT") return <label className={span}><span className="label">{field.label}</span><select className="field" name={name} required={field.required} defaultValue={defaultText}><option value="">Select</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.fieldType === "CHECKBOX") return <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 font-bold"><input type="checkbox" name={name} defaultChecked={value ? value === "on" : field.defaultValue === true} required={field.required} /> {field.label}</label>;
  const type = field.fieldType === "DATE" ? "date" : field.fieldType === "NUMBER" || field.fieldType === "MONEY" ? "number" : "text";
  const min = type === "date" && typeof field.validation.min === "string" ? field.validation.min : type === "number" && typeof field.validation.min === "number" ? field.validation.min : undefined;
  const max = type === "date" && typeof field.validation.max === "string" ? field.validation.max : type === "number" && typeof field.validation.max === "number" ? field.validation.max : undefined;
  return <label className={span}><span className="label">{field.label}</span><input className="field" name={name} type={type} step={field.fieldType === "MONEY" ? "0.01" : undefined} min={min} max={max} minLength={type === "text" ? field.validation.minLength : undefined} maxLength={type === "text" ? field.validation.maxLength : undefined} pattern={type === "text" ? field.validation.pattern : undefined} required={field.required} defaultValue={defaultText} /></label>;
}
