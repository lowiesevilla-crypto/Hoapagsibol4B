"use client";

import { CirclePlus, Landmark, Minus, ReceiptText, Search, Trash2, UserRoundCheck, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { createPettyCashVoucherAction } from "@/lib/actions/petty-cash";

type PayeeOption = { id: string; label: string; address: string; search: string };
type ExpenseOption = { id: string; name: string };
type OfficerOption = { id: string; label: string; position: string };
type EmployeeOption = { id: string; label: string; search: string };
type PayeeType = "EMPLOYEE" | "HOMEOWNER" | "RENTER" | "CONTRACTOR" | "OTHER";
type DraftItem = { key: string; categoryId: string; otherParticular: string; amount: string };

const PAYEE_TYPES: Array<{ value: PayeeType; label: string }> = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "HOMEOWNER", label: "Homeowner" },
  { value: "RENTER", label: "Renter" },
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "OTHER", label: "Other" },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function peso(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

export function PettyCashVoucherForm({
  today,
  payees,
  expenseTypes,
  officers,
  employees,
  currentAdminName,
}: {
  today: string;
  payees: Record<Exclude<PayeeType, "OTHER">, PayeeOption[]>;
  expenseTypes: ExpenseOption[];
  officers: OfficerOption[];
  employees: EmployeeOption[];
  currentAdminName: string;
}) {
  const [payeeType, setPayeeType] = useState<PayeeType>("EMPLOYEE");
  const [payeeQuery, setPayeeQuery] = useState("");
  const [payeeEntityId, setPayeeEntityId] = useState("");
  const [otherPayeeName, setOtherPayeeName] = useState("");
  const [address, setAddress] = useState("");
  const [hasRecordedAddress, setHasRecordedAddress] = useState(false);
  const [approverType, setApproverType] = useState<"ADMIN" | "OFFICER">("ADMIN");
  const [items, setItems] = useState<DraftItem[]>([{ key: "line-1", categoryId: "", otherParticular: "", amount: "" }]);
  const [employeeAdvanceEmployeeId, setEmployeeAdvanceEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");

  const currentPayees = payeeType === "OTHER" ? [] : payees[payeeType];
  const matchingPayees = useMemo(() => {
    const term = payeeQuery.trim().toLowerCase();
    return currentPayees.filter((item) => !term || item.search.includes(term)).slice(0, 60);
  }, [currentPayees, payeeQuery]);
  const matchingEmployees = useMemo(() => {
    const term = employeeQuery.trim().toLowerCase();
    return employees.filter((item) => !term || item.search.includes(term)).slice(0, 60);
  }, [employees, employeeQuery]);
  const categoryById = useMemo(() => new Map(expenseTypes.map((item) => [item.id, item.name])), [expenseTypes]);
  const total = useMemo(() => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), [items]);
  const hasEmployeeCashAdvance = useMemo(() => items.some((item) => {
    const particular = item.categoryId === "OTHER" ? item.otherParticular : categoryById.get(item.categoryId) || "";
    return normalize(particular) === "employee cash advance";
  }), [items, categoryById]);

  function changePayeeType(next: PayeeType) {
    setPayeeType(next);
    setPayeeQuery("");
    setPayeeEntityId("");
    setOtherPayeeName("");
    setAddress("");
    setHasRecordedAddress(false);
  }

  function selectPayee(id: string) {
    setPayeeEntityId(id);
    const selected = currentPayees.find((item) => item.id === id);
    const recorded = selected?.address?.trim() || "";
    setAddress(recorded);
    setHasRecordedAddress(Boolean(recorded));
    if (payeeType === "EMPLOYEE" && !employeeAdvanceEmployeeId) setEmployeeAdvanceEmployeeId(id);
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function addItem() {
    setItems((current) => current.length >= 40 ? current : [...current, { key: `line-${Date.now()}-${current.length}`, categoryId: "", otherParticular: "", amount: "" }]);
  }

  function removeItem(key: string) {
    setItems((current) => current.length === 1 ? current : current.filter((item) => item.key !== key));
  }

  const serializedItems = JSON.stringify(items.map(({ categoryId, otherParticular, amount }) => ({ categoryId, otherParticular, amount })));

  return <form action={createPettyCashVoucherAction} className="space-y-5">
    <input type="hidden" name="itemsJson" value={serializedItems} />
    <input type="hidden" name="payeeType" value={payeeType} />
    <input type="hidden" name="payeeEntityId" value={payeeEntityId} />
    <input type="hidden" name="otherPayeeName" value={otherPayeeName} />
    <input type="hidden" name="approverType" value={approverType} />

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="voucher-details-heading">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><ReceiptText className="size-5" /></span>
        <div><h2 id="voucher-details-heading" className="text-lg font-black text-ink">Voucher details</h2><p className="mt-1 text-sm text-slate-500">Start with the transaction date. The voucher number is generated safely when the record is saved.</p></div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Transaction no.</span><input className="field bg-slate-50 font-mono text-slate-500" value="Generated on save" readOnly aria-readonly="true" /></label>
        <label><span className="label">Date</span><input className="field" type="date" name="transactionDate" defaultValue={today} required /></label>
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="payee-heading">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700"><UserRoundCheck className="size-5" /></span>
        <div><h2 id="payee-heading" className="text-lg font-black text-ink">Payee</h2><p className="mt-1 text-sm text-slate-500">Choose the record type first, then search only the relevant tenant directory.</p></div>
      </div>

      <fieldset className="mt-5">
        <legend className="label">Name type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PAYEE_TYPES.map((type) => <button key={type.value} type="button" onClick={() => changePayeeType(type.value)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-black transition ${payeeType === type.value ? "border-pine-700 bg-pine-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-pine-200 hover:bg-pine-50"}`} aria-pressed={payeeType === type.value}>{type.label}</button>)}
        </div>
      </fieldset>

      {payeeType === "OTHER" ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Name</span><input className="field" value={otherPayeeName} onChange={(event) => setOtherPayeeName(event.target.value)} placeholder="Enter payee name" required /></label>
        <label><span className="label">Address</span><input className="field" name="address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Enter address if available" /></label>
      </div> : <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor="petty-payee-search">Search {PAYEE_TYPES.find((item) => item.value === payeeType)?.label}</label>
          <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" /><input id="petty-payee-search" className="field pl-10" type="search" value={payeeQuery} onChange={(event) => setPayeeQuery(event.target.value)} placeholder="Search by name, account or property" autoComplete="off" /></div>
          <select className="field mt-2" value={payeeEntityId} onChange={(event) => selectPayee(event.target.value)} required>
            <option value="">Select a matching record</option>
            {matchingPayees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          {!matchingPayees.length && <p className="mt-1 text-xs font-semibold text-rose-600">No matching active records.</p>}
        </div>
        <label><span className="label">Address</span><input className={`field ${hasRecordedAddress ? "bg-slate-50 text-slate-600" : ""}`} name="address" value={address} onChange={(event) => setAddress(event.target.value)} readOnly={hasRecordedAddress} placeholder={hasRecordedAddress ? "" : "No saved address — type it here"} /><span className="mt-1 block text-xs text-slate-400">{hasRecordedAddress ? "Auto-populated from the selected record." : "Editable because the selected record has no saved address."}</span></label>
      </div>}
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="particulars-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700"><WalletCards className="size-5" /></span><div><h2 id="particulars-heading" className="text-lg font-black text-ink">Particulars & amounts</h2><p className="mt-1 text-sm text-slate-500">Expense types come from this tenant. Choosing Other creates a reusable expense type after save.</p></div></div>
        <button type="button" onClick={addItem} className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2"><CirclePlus className="size-4" /> Add item</button>
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item, index) => <div key={item.key} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_44px] lg:items-end">
          <label><span className="label">Particular {index + 1}</span><select className="field bg-white" value={item.categoryId} onChange={(event) => updateItem(item.key, { categoryId: event.target.value, otherParticular: event.target.value === "OTHER" ? item.otherParticular : "" })} required><option value="">Select expense type</option>{expenseTypes.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="OTHER">Other — create new type</option></select></label>
          <label className={item.categoryId === "OTHER" ? "block" : "hidden"}><span className="label">Other particular</span><input className="field bg-white" value={item.otherParticular} onChange={(event) => updateItem(item.key, { otherParticular: event.target.value })} placeholder="Type the new expense type" required={item.categoryId === "OTHER"} /></label>
          {item.categoryId !== "OTHER" && <div className="hidden lg:block" aria-hidden="true" />}
          <label><span className="label">Amount</span><input className="field bg-white text-right font-black" type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => updateItem(item.key, { amount: event.target.value })} placeholder="0.00" required /></label>
          <button type="button" onClick={() => removeItem(item.key)} disabled={items.length === 1} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-35" aria-label={`Remove particular ${index + 1}`}><Trash2 className="size-4" /></button>
        </div>)}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl bg-pine-950 px-4 py-4 text-white sm:px-5"><span className="text-sm font-bold uppercase tracking-wide text-pine-100">Voucher total</span><strong className="text-xl font-black sm:text-2xl">{peso(total)}</strong></div>
    </section>

    {hasEmployeeCashAdvance && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6" aria-labelledby="cash-advance-heading">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-amber-700 shadow-sm"><Landmark className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-amber-700">Payroll integration</p><h2 id="cash-advance-heading" className="mt-1 text-lg font-black text-amber-950">Employee Cash Advance</h2><p className="mt-1 text-sm leading-6 text-amber-900">This section appears only because an Employee Cash Advance particular is present. Saving creates the employee loan and stores the per-cutoff deduction schedule.</p></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div><label className="label" htmlFor="advance-employee-search">Employee to deduct</label><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" /><input id="advance-employee-search" className="field bg-white pl-10" type="search" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search employee" /></div><select className="field mt-2 bg-white" name="employeeAdvanceEmployeeId" value={employeeAdvanceEmployeeId} onChange={(event) => setEmployeeAdvanceEmployeeId(event.target.value)} required><option value="">Select employee</option>{matchingEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}</select></div>
        <label><span className="label">Deduction amount per cutoff</span><input className="field bg-white" name="deductionPerCutoff" type="number" min="0.01" step="0.01" placeholder="0.00" required /><span className="mt-1 block text-xs text-amber-800">The schedule is linked to the generated employee cash-advance loan.</span></label>
      </div>
    </section>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="approval-heading">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-700"><UserRoundCheck className="size-5" /></span><div><h2 id="approval-heading" className="text-lg font-black text-ink">Approval & receipt</h2><p className="mt-1 text-sm text-slate-500">Received By follows the selected payee automatically. Choose whether approval is by the current admin or an active officer.</p></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div><span className="label">Approved by</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setApproverType("ADMIN")} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${approverType === "ADMIN" ? "border-pine-700 bg-pine-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>Current admin</button><button type="button" onClick={() => setApproverType("OFFICER")} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${approverType === "OFFICER" ? "border-pine-700 bg-pine-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>Organization officer</button></div><p className="mt-2 text-xs text-slate-500">Current admin: <strong>{currentAdminName}</strong></p></div>
        {approverType === "OFFICER" ? <label><span className="label">Officer</span><select className="field" name="approvingOfficerId" required><option value="">Select active officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.label} — {officer.position}</option>)}</select></label> : <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Received by</p><p className="mt-1 font-black text-ink">{payeeType === "OTHER" ? otherPayeeName || "Payee name" : currentPayees.find((item) => item.id === payeeEntityId)?.label || "Select a payee"}</p><p className="mt-1 text-xs text-slate-500">Populated from the Name selected above.</p></div>}
      </div>
    </section>

    <div className="sticky bottom-3 z-20 rounded-2xl border border-pine-100 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div className="hidden sm:block"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Ready to post</p><p className="text-sm font-semibold text-slate-600">Creates the voucher and finance expense entries in one transaction.</p></div>
      <button className="btn-primary inline-flex min-h-12 w-full items-center justify-center gap-2 sm:w-auto"><WalletCards className="size-4" /> Create & open voucher</button>
    </div>
  </form>;
}
