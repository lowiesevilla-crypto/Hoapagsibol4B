"use client";

import { useMemo, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { submitDocumentRequestAction } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

export type PortalDocumentField = {
  key: string;
  label: string;
  fieldType: "TEXT" | "TEXTAREA" | "DATE" | "NUMBER" | "MONEY" | "SELECT" | "CHECKBOX";
  required: boolean;
  defaultValue: string | boolean | null;
  options: Array<{ label: string; value: string }>;
  validation: {
    min?: number;
    max?: number;
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
};

export function DocumentRequestForm({ configs, members, disabled = false }: { configs: PortalDocumentConfig[]; members: PortalHouseholdMember[]; disabled?: boolean }) {
  const [configurationId, setConfigurationId] = useState(configs[0]?.id || "");
  const [subjectType, setSubjectType] = useState<"SELF" | "HOUSEHOLD_MEMBER">("SELF");
  const selected = useMemo(() => configs.find((config) => config.id === configurationId) || configs[0], [configurationId, configs]);
  if (!selected) return <section className="card"><h2 className="text-lg font-black">Request an HOA document</h2><p className="mt-2 text-sm text-slate-500">No document types are currently available. Please contact the HOA office.</p></section>;
  return <form action={submitDocumentRequestAction} className="card">
    <h2 className="text-lg font-black">Request an HOA document</h2>
    <p className="mb-5 text-sm text-slate-500">Select who the document is for and complete the tenant-required fields.</p>
    <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2 disabled:opacity-60">
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
            <input type="radio" name="subjectType" value="HOUSEHOLD_MEMBER" checked={subjectType === "HOUSEHOLD_MEMBER"} onChange={() => setSubjectType("HOUSEHOLD_MEMBER")} disabled={members.length === 0} />
            Registered household/family member
          </label>
        </div>
      </div>
      {subjectType === "HOUSEHOLD_MEMBER" && <div className="md:col-span-2">
        <label className="label">Household/family member</label>
        <select className="field" name="subjectMemberId" required>
          <option value="">Select a registered member</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.fullName} - {member.relationship}</option>)}
        </select>
      </div>}
      <div>
        <label className="label">Number of copies</label>
        <input className="field" name="numberOfCopies" type="number" min={1} max={selected.maxCopies} defaultValue={1} />
      </div>
      {selected.fields.map((field) => <ConfiguredField key={`${selected.id}-${field.key}`} field={field} />)}
      <div className="md:col-span-2"><SubmitButton><FilePlus2 className="size-4" /> Submit request</SubmitButton></div>
    </fieldset>
  </form>;
}

function ConfiguredField({ field }: { field: PortalDocumentField }) {
  const name = `field_${field.key}`;
  const span = field.fieldType === "TEXTAREA" ? "md:col-span-2" : "";
  const defaultText = typeof field.defaultValue === "string" ? field.defaultValue : "";
  if (field.fieldType === "TEXTAREA") return <label className={span}><span className="label">{field.label}</span><textarea className="field min-h-24" name={name} minLength={field.validation.minLength} maxLength={field.validation.maxLength ?? (field.key === "purpose" ? 500 : 1000)} required={field.required} defaultValue={defaultText} /></label>;
  if (field.fieldType === "SELECT") return <label className={span}><span className="label">{field.label}</span><select className="field" name={name} required={field.required} defaultValue={defaultText}><option value="">Select</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.fieldType === "CHECKBOX") return <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 font-bold"><input type="checkbox" name={name} defaultChecked={field.defaultValue === true} required={field.required} /> {field.label}</label>;
  const type = field.fieldType === "DATE" ? "date" : field.fieldType === "NUMBER" || field.fieldType === "MONEY" ? "number" : "text";
  return <label className={span}><span className="label">{field.label}</span><input className="field" name={name} type={type} step={field.fieldType === "MONEY" ? "0.01" : undefined} min={field.validation.min} max={field.validation.max} minLength={type === "text" ? field.validation.minLength : undefined} maxLength={type === "text" ? field.validation.maxLength : undefined} pattern={type === "text" ? field.validation.pattern : undefined} required={field.required} defaultValue={defaultText} /></label>;
}
