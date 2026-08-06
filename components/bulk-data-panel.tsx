"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Upload } from "lucide-react";
import { importMasterDataAction, type BulkImportState } from "@/lib/actions/bulk-data";
import type { MasterDataType } from "@/lib/master-data";
import { SubmitButton } from "@/components/ui";

const initialState: BulkImportState = { success: false, message: "", imported: 0, errors: [] };
const types: Array<{ value: Exclude<MasterDataType, "homeowners">; label: string; note: string }> = [
  { value: "contractors", label: "Contractors", note: "Company and contact master data." },
  { value: "vehicles", label: "Vehicles", note: "Vehicle and sticker monitoring linked by homeowner email." },
  { value: "employees", label: "Employees", note: "Employee master data for payroll." },
  { value: "attendance", label: "Attendance Records", note: "Attendance linked by employee number and date." },
];

export function BulkDataPanel() {
  const [state, action] = useActionState(importMasterDataAction, initialState);
  return <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
    <form action={action} className="card">
      <div className="mb-5"><h2 className="text-lg font-black">Upload master data</h2><p className="text-sm text-slate-500">Use the matching CSV template. The system validates every row first and rejects the whole upload when errors are found.</p></div>
      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-black">Homeowner imports moved to secure onboarding</p>
        <p className="mt-1">Homeowner CSV files no longer accept passwords. Use the activation-only, dry-run onboarding importer.</p>
        <Link className="btn-secondary mt-3 inline-flex" href="/admin/onboarding">Open tenant onboarding</Link>
      </div>
      <div className="space-y-4">
        <div><label className="label">Record type</label><select className="field" name="type" required>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></div>
        <div><label className="label">CSV file</label><input className="field" name="file" type="file" accept=".csv,text/csv" required /></div>
        <SubmitButton><Upload className="size-4" /> Validate and import</SubmitButton>
      </div>
    </form>

    <section className="card">
      <h2 className="text-lg font-black">Download templates and backups</h2>
      <p className="mb-4 text-sm text-slate-500">Templates provide the required import format. Exports can be used for backup, restoration preparation, and reporting.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {types.map((type) => <div key={type.value} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="font-black">{type.label}</p>
          <p className="mb-3 text-xs text-slate-500">{type.note}</p>
          <div className="flex flex-wrap gap-2"><a className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/data/template?type=${type.value}`}>Template</a><a className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/data/export?type=${type.value}`}>Export</a></div>
        </div>)}
      </div>
    </section>

    {(state.message || state.errors.length > 0) && <section className={`card xl:col-span-2 ${state.success ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
      <h2 className={`text-lg font-black ${state.success ? "text-emerald-800" : "text-rose-800"}`}>{state.success ? "Import successful" : "Import validation result"}</h2>
      <p className="mt-1 text-sm">{state.message}</p>
      {state.errors.length > 0 && <div className="mt-4 max-h-80 overflow-y-auto rounded-xl bg-white p-3 text-sm"><ul className="list-disc space-y-1 pl-5">{state.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div>}
    </section>}
  </div>;
}