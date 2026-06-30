"use client";

import { useActionState, useState } from "react";
import { DatabaseBackup, Upload } from "lucide-react";
import { importDataMigrationsAction, postDataMigrationAction, type MigrationImportState } from "@/lib/actions/data-migrations";
import { SubmitButton } from "@/components/ui";

type Option = { id: string; label: string };
const initialState: MigrationImportState = { success: false, message: "", imported: 0, errors: [] };
const kinds = [
  ["DUES_OPENING_BALANCE", "Monthly dues opening balance"],
  ["CONSTRUCTION_BOND_OPENING_BALANCE", "Construction bond opening balance"],
  ["CONTRACTOR_BOND_OPENING_BALANCE", "Contractor bond opening balance"],
  ["DUES_PREVIOUS_COLLECTION", "Previous monthly dues collection"],
  ["CONSTRUCTION_BOND_PREVIOUS_COLLECTION", "Previous construction bond collection"],
  ["CONTRACTOR_BOND_PREVIOUS_COLLECTION", "Previous contractor bond collection"],
  ["CONSTRUCTION_BOND_REFUND", "Previous construction bond refund"],
  ["CONTRACTOR_BOND_REFUND", "Previous contractor bond refund"],
  ["CONSTRUCTION_BOND_FORFEITURE", "Previous construction bond forfeiture"],
  ["CONTRACTOR_BOND_FORFEITURE", "Previous contractor bond forfeiture"],
] as const;

export function DataMigrationPanel({ homeowners, contractors }: { homeowners: Option[]; contractors: Option[] }) {
  const [kind, setKind] = useState(kinds[0][0]);
  const [state, uploadAction] = useActionState(importDataMigrationsAction, initialState);
  const isDues = kind.startsWith("DUES_");
  const isConstruction = kind.startsWith("CONSTRUCTION_BOND");
  const isContractor = kind.startsWith("CONTRACTOR_BOND");
  const isAdjustment = kind.endsWith("REFUND") || kind.endsWith("FORFEITURE");

  return <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
    <form action={postDataMigrationAction} className="card" onSubmit={(event) => {
      const data = new FormData(event.currentTarget);
      const label = kinds.find(([value]) => value === data.get("kind"))?.[1] || "migration";
      const summary = [`Type: ${label}`, `Amount: PHP ${Number(data.get("amount") || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`, `Period/date: ${data.get("period") || "Not supplied"}`, `Remarks: ${data.get("remarks") || "None"}`].join("\n");
      if (!window.confirm(`Validate and post this historical entry?\n\n${summary}\n\nBalances and reports will be recalculated.`)) event.preventDefault();
    }}>
      <div className="mb-5"><h2 className="text-lg font-black">Manual balance or collection migration</h2><p className="text-sm text-slate-500">Post one opening balance or historical transaction. Required audit tags are added automatically.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><label className="label">Migration type</label><select className="field" name="kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {(isDues || isConstruction) && !isAdjustment && <div><label className="label">Homeowner</label><select className="field" name="homeownerId" required><option value="">Select homeowner</option>{homeowners.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
        {isContractor && !isAdjustment && <div><label className="label">Contractor</label><select className="field" name="contractorId" required><option value="">Select contractor</option>{contractors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>}
        <div><label className="label">{isDues ? "Billing period" : "Transaction date (optional)"}</label><input className="field" name="period" type="date" required={isDues} /></div>
        <div><label className="label">Amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" required /></div>
        <div><label className="label">Original reference number</label><input className="field" name="referenceNumber" maxLength={100} /></div>
        {isAdjustment && <div><label className="label">Related bond receipt number</label><input className="field" name="relatedReceiptNumber" placeholder="AR-CB-YYYY-XXXXXXX" required /></div>}
        <div className="md:col-span-2"><label className="label">Migration remarks <span className="text-rose-600">*</span></label><textarea className="field min-h-24" name="remarks" maxLength={1000} placeholder="Source document, prior system, reason, and reconciliation notes" required /></div>
        <label className="md:col-span-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><input className="mt-1" name="allowDuplicate" type="checkbox" /><span><b>Intentional duplicate override</b><br />Use only when supporting records prove that a similar payer/type/period entry is a separate valid transaction. The override is recorded in the audit log.</span></label>
      </div>
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Validation summary:</b> payer ownership, required period, amount, related bond balance, and duplicate migration key are checked before anything is posted.</div>
      <div className="mt-4"><SubmitButton><DatabaseBackup className="size-4" /> Validate and post</SubmitButton></div>
    </form>

    <div className="space-y-6">
      <form action={uploadAction} className="card">
        <h2 className="text-lg font-black">Bulk migration CSV</h2>
        <p className="mb-4 text-sm text-slate-500">The entire upload is rejected if any row fails validation. Duplicate rows are never posted.</p>
        <label className="label">CSV file</label><input className="field" name="file" type="file" accept=".csv,text/csv" required />
        <div className="mt-4 flex flex-wrap gap-2"><SubmitButton><Upload className="size-4" /> Validate and import</SubmitButton><a className="btn-secondary" href="/admin/data/migrations/template">Download template</a></div>
      </form>
      {(state.message || state.errors.length > 0) && <section className={`card ${state.success ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}><h3 className="font-black">{state.success ? "Import successful" : "Import validation result"}</h3><p className="mt-1 text-sm">{state.message}</p>{state.errors.length > 0 && <ul className="mt-3 max-h-56 list-disc space-y-1 overflow-y-auto pl-5 text-sm">{state.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>}</section>}
    </div>
  </div>;
}
