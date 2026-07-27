"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, UserRound } from "lucide-react";
import { generateManualDocumentAction } from "@/lib/actions/documents";
import { SubmitButton } from "@/components/ui";

type Choice = { id: string; label: string };
type WalkInField = {
  key: string;
  label: string;
  fieldType: "TEXT" | "TEXTAREA" | "DATE" | "NUMBER" | "MONEY" | "SELECT" | "CHECKBOX";
  required: boolean;
  defaultValue: string | boolean | null;
  options: Array<{ label: string; value: string }>;
  validation: { min?: number | string; max?: number | string; minLength?: number; maxLength?: number; pattern?: string };
};
type DefinitionChoice = {
  id: string;
  label: string;
  workflow: string;
  fee: string;
  balancePolicy: string;
  approvalRequired: boolean;
  walkInEnabled: boolean;
  householdMemberEnabled: boolean;
  template: string;
  templateName: string;
  templateStatus: string;
  templatePublishedAt: string;
  nextStep: string;
  fields: WalkInField[];
};
type HomeownerResult = { id: string; name: string; email: string; accountNumber: string; phone: string; block: string; lot: string; address: string };
type HouseholdMemberResult = { id: string; fullName: string; relationship: string; birthDate: string | null; civilStatus: string | null; nationality: string | null; address: string | null };

export function ManualDocumentForm({ officers, definitions }: { officers: Choice[]; definitions: DefinitionChoice[] }) {
  const [definitionId, setDefinitionId] = useState(definitions[0]?.id || "");
  const [query, setQuery] = useState("");
  const [homeowners, setHomeowners] = useState<HomeownerResult[]>([]);
  const [homeownerId, setHomeownerId] = useState("");
  const [members, setMembers] = useState<HouseholdMemberResult[]>([]);
  const [subjectType, setSubjectType] = useState<"SELF" | "HOUSEHOLD_MEMBER">("SELF");
  const [subjectMemberId, setSubjectMemberId] = useState("");
  const [loadingHomeowners, setLoadingHomeowners] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const selected = definitions.find((definition) => definition.id === definitionId);
  const selectedHomeowner = homeowners.find((homeowner) => homeowner.id === homeownerId);
  const canUseHouseholdMember = Boolean(selected?.householdMemberEnabled && members.length);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoadingHomeowners(true);
      try {
        const response = await fetch(`/api/admin/document-walk-in/homeowners?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const payload = response.ok ? await response.json() as { homeowners: HomeownerResult[] } : { homeowners: [] };
        if (!cancelled) setHomeowners(payload.homeowners);
      } finally {
        if (!cancelled) setLoadingHomeowners(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    setSubjectType("SELF");
    setSubjectMemberId("");
    setMembers([]);
    if (!homeownerId) return;
    setLoadingMembers(true);
    fetch(`/api/admin/document-walk-in/homeowners/${encodeURIComponent(homeownerId)}/household-members`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { members: [] })
      .then((payload: { members: HouseholdMemberResult[] }) => { if (!cancelled) setMembers(payload.members); })
      .finally(() => { if (!cancelled) setLoadingMembers(false); });
    return () => { cancelled = true; };
  }, [homeownerId]);

  const selectedSummary = useMemo(() => selected ? [
    ["Document type", selected.label],
    ["Workflow", selected.workflow],
    ["Fee", selected.fee],
    ["Balance policy", selected.balancePolicy],
    ["Approval", selected.approvalRequired ? "Required" : "Not required"],
    ["Household subjects", selected.householdMemberEnabled ? "Enabled" : "Disabled"],
    ["Template name", selected.templateName],
    ["Published template", selected.template],
    ["Template status", selected.templateStatus],
    ["Last published", selected.templatePublishedAt ? new Date(selected.templatePublishedAt).toLocaleDateString() : "Not recorded"],
    ["Expected next step", selected.nextStep],
  ] : [], [selected]);

  return <form action={generateManualDocumentAction} className="card max-w-6xl">
    <div className="mb-6"><h2 className="text-lg font-black">Walk-In / Office Request</h2><p className="text-sm text-slate-500">Create a tenant-scoped office-assisted request using the selected document definition and official workflow.</p></div>
    {!definitions.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">No walk-in document types are currently available. Review Document Type configuration, template publication, and Walk-In availability.</div> : <>
      <input type="hidden" name="homeownerId" value={homeownerId} />
      <input type="hidden" name="subjectType" value={subjectType} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-4">
          <Field label="Homeowner search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" />
              <input className="field pl-10" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, 11-digit account number, block, lot, or phone" autoComplete="off" />
            </div>
          </Field>
          <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
            {homeowners.map((homeowner) => <button key={homeowner.id} type="button" onClick={() => setHomeownerId(homeowner.id)} className={`grid w-full gap-1 border-b border-slate-100 p-3 text-left last:border-b-0 hover:bg-pine-50 ${homeownerId === homeowner.id ? "bg-pine-50" : "bg-white"}`}>
              <span className="flex items-center justify-between gap-3 font-black"><span>{homeowner.name}</span>{homeownerId === homeowner.id && <Check className="size-4 text-pine-700" />}</span>
              <span className="font-mono text-xs font-bold text-slate-500">{homeowner.accountNumber}</span>
              <span className="text-xs text-slate-500">Block {homeowner.block}, Lot {homeowner.lot} · {homeowner.email} · {homeowner.phone}</span>
            </button>)}
            {loadingHomeowners && <p className="p-3 text-sm font-semibold text-slate-500">Searching...</p>}
            {!loadingHomeowners && !homeowners.length && <p className="p-3 text-sm font-semibold text-slate-500">No matching active homeowner found.</p>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Document type"><select className="field" name="definitionId" value={definitionId} onChange={(event) => setDefinitionId(event.target.value)} required>{definitions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>
            <Field label="Office request reason"><input className="field" name="onBehalfReason" placeholder="Why the HOA office is creating this request" required /></Field>
            <Officer label="Approving officer" name="approvedByOfficerId" officers={officers} />
            <Officer label="Processed by" name="processedByOfficerId" officers={officers} />
          </div>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 font-black"><UserRound className="size-4" /> Request subject</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 font-bold"><input type="radio" checked={subjectType === "SELF"} onChange={() => setSubjectType("SELF")} /> Homeowner</label>
              <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 font-bold"><input type="radio" checked={subjectType === "HOUSEHOLD_MEMBER"} onChange={() => setSubjectType("HOUSEHOLD_MEMBER")} disabled={!canUseHouseholdMember} /> Household / family member</label>
            </div>
            {subjectType === "HOUSEHOLD_MEMBER" && <Field label="Validated household/family member"><select className="field" name="subjectMemberId" value={subjectMemberId} onChange={(event) => setSubjectMemberId(event.target.value)} required><option value="">Select member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.fullName} - {member.relationship}</option>)}</select></Field>}
            {loadingMembers && <p className="mt-2 text-xs font-bold text-slate-500">Loading household members...</p>}
            {selectedHomeowner && !members.length && !loadingMembers && <p className="mt-2 text-xs font-bold text-slate-500">No validated and active household/family member is available for this homeowner.</p>}
          </section>
          {selected?.fields.length ? <section className="grid gap-4 md:grid-cols-2">{selected.fields.map((field) => <ConfiguredField key={`${selected.id}-${field.key}`} field={field} />)}</section> : <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">This document has no active dynamic fields. Confirm the definition before submitting.</p>}
        </section>
        <aside className="space-y-4">
          <section className="rounded-xl border border-pine-200 bg-pine-50 p-4" aria-live="polite"><h3 className="font-black">Request policy summary</h3><div className="mt-3 grid gap-3 text-sm">{selectedSummary.map(([label, value]) => <Summary key={label} label={label} value={value} />)}</div></section>
          {selectedHomeowner && <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-black">Selected homeowner</h3><dl className="mt-3 space-y-2 text-sm"><Summary label="Name" value={selectedHomeowner.name} /><Summary label="Account number" value={selectedHomeowner.accountNumber} /><Summary label="Property" value={`Block ${selectedHomeowner.block}, Lot ${selectedHomeowner.lot}`} /><Summary label="Address" value={selectedHomeowner.address} /></dl></section>}
        </aside>
      </div>
      <div className="mt-6"><SubmitButton>{selected?.nextStep || "Create request"}</SubmitButton></div>
    </>}
  </form>;
}

function ConfiguredField({ field }: { field: WalkInField }) {
  const name = `field_${field.key}`;
  const span = field.fieldType === "TEXTAREA" ? "md:col-span-2" : "";
  const defaultText = typeof field.defaultValue === "string" ? field.defaultValue : "";
  if (field.fieldType === "TEXTAREA") return <label className={span}><span className="label">{field.label}</span><textarea className="field min-h-24" name={name} minLength={field.validation.minLength} maxLength={field.validation.maxLength ?? (field.key === "purpose" ? 500 : 1000)} required={field.required} defaultValue={defaultText} /></label>;
  if (field.fieldType === "SELECT") return <label className={span}><span className="label">{field.label}</span><select className="field" name={name} required={field.required} defaultValue={defaultText}><option value="">Select</option>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  if (field.fieldType === "CHECKBOX") return <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 font-bold"><input type="checkbox" name={name} defaultChecked={field.defaultValue === true} required={field.required} /> {field.label}</label>;
  const type = field.fieldType === "DATE" ? "date" : field.fieldType === "NUMBER" || field.fieldType === "MONEY" ? "number" : "text";
  const min = type === "date" && typeof field.validation.min === "string" ? field.validation.min : type === "number" && typeof field.validation.min === "number" ? field.validation.min : undefined;
  const max = type === "date" && typeof field.validation.max === "string" ? field.validation.max : type === "number" && typeof field.validation.max === "number" ? field.validation.max : undefined;
  return <label className={span}><span className="label">{field.label}</span><input className="field" name={name} type={type} step={field.fieldType === "MONEY" ? "0.01" : undefined} min={min} max={max} minLength={type === "text" ? field.validation.minLength : undefined} maxLength={type === "text" ? field.validation.maxLength : undefined} pattern={type === "text" ? field.validation.pattern : undefined} required={field.required} defaultValue={defaultText} /></label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="label">{label}</span>{children}</label>; }
function Officer({ label, name, officers }: { label: string; name: string; officers: Choice[] }) { return <Field label={label}><select className="field" name={name}><option value="">Current administrator</option>{officers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></Field>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words font-black text-slate-900">{value}</p></div>; }
