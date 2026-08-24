"use client";

import { CirclePlus, Save, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { updatePettyCashVoucherAction } from "@/lib/actions/petty-cash-maintenance";

type PayeeOption = { id: string; label: string; address: string; search: string };
type ExpenseOption = { id: string; name: string };
type OfficerOption = { id: string; label: string; position: string };
type EmployeeOption = { id: string; label: string; search: string };
type PayeeType = "EMPLOYEE" | "HOMEOWNER" | "RENTER" | "CONTRACTOR" | "OTHER";
type DraftItem = { key: string; categoryId: string; otherParticular: string; amount: string };

type InitialVoucher = {
  id: string;
  voucherNumber: string;
  transactionDate: string;
  payeeType: PayeeType;
  payeeEntityId: string;
  payeeName: string;
  address: string;
  approvedByType: "ADMIN" | "OFFICER";
  approvedById: string;
  employeeId: string;
  deductionPerCutoff: string;
  items: Array<{ categoryId: string; particular: string; amount: string }>;
};

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

export function PettyCashVoucherEditForm({
  initial,
  payees,
  expenseTypes,
  officers,
  employees,
  currentAdminName,
}: {
  initial: InitialVoucher;
  payees: Record<Exclude<PayeeType, "OTHER">, PayeeOption[]>;
  expenseTypes: ExpenseOption[];
  officers: OfficerOption[];
  employees: EmployeeOption[];
  currentAdminName: string;
}) {
  const [payeeType, setPayeeType] = useState<PayeeType>(initial.payeeType);
  const [payeeQuery, setPayeeQuery] = useState("");
  const [payeeEntityId, setPayeeEntityId] = useState(initial.payeeEntityId);
  const [otherPayeeName, setOtherPayeeName] = useState(initial.payeeType === "OTHER" ? initial.payeeName : "");
  const [address, setAddress] = useState(initial.address);
  const [approverType, setApproverType] = useState<"ADMIN" | "OFFICER">(initial.approvedByType);
  const [approvingOfficerId, setApprovingOfficerId] = useState(initial.approvedByType === "OFFICER" ? initial.approvedById : "");
  const [employeeAdvanceEmployeeId, setEmployeeAdvanceEmployeeId] = useState(initial.employeeId);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [deductionPerCutoff, setDeductionPerCutoff] = useState(initial.deductionPerCutoff);
  const [items, setItems] = useState<DraftItem[]>(initial.items.map((item, index) => ({
    key: `existing-${index}`,
    categoryId: item.categoryId,
    otherParticular: "",
    amount: item.amount,
  })));

  const currentPayees = useMemo(() => payeeType === "OTHER" ? [] : payees[payeeType], [payeeType, payees]);
  const matchingPayees = useMemo(() => {
    const term = payeeQuery.trim().toLowerCase();
    return currentPayees.filter((item) => !term || item.search.includes(term)).slice(0, 100);
  }, [currentPayees, payeeQuery]);
  const matchingEmployees = useMemo(() => {
    const term = employeeQuery.trim().toLowerCase();
    return employees.filter((item) => !term || item.search.includes(term)).slice(0, 100);
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
    setPayeeEntityId(next === initial.payeeType ? initial.payeeEntityId : "");
    setOtherPayeeName(next === "OTHER" ? (initial.payeeType === "OTHER" ? initial.payeeName : "") : "");
    setAddress(next === initial.payeeType ? initial.address : "");
  }

  function selectPayee(id: string) {
    setPayeeEntityId(id);
    const selected = currentPayees.find((item) => item.id === id);
    if (selected) {
      setAddress(selected.address || "");
      if (payeeType === "EMPLOYEE" && !employeeAdvanceEmployeeId) setEmployeeAdvanceEmployeeId(id);
    }
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
  const receivedBy = payeeType === "OTHER"
    ? otherPayeeName
    : currentPayees.find((item) => item.id === payeeEntityId)?.label.split(" · ")[0] || initial.payeeName;

  return <form action={updatePettyCashVoucherAction} className="space-y-5">
    <input type="hidden" name="voucherId" value={initial.id} />
    <input type="hidden" name="itemsJson" value={serializedItems} />
    <input type="hidden" name="payeeType" value={payeeType} />
    <input type="hidden" name="payeeEntityId" value={payeeEntityId} />
    <input type="hidden" name="otherPayeeName" value={otherPayeeName} />
    <input type="hidden" name="approverType" value={approverType} />

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">Voucher no.</span><input className="field bg-slate-50 font-mono font-bold text-slate-600" value={initial.voucherNumber} readOnly /></label>
        <label><span className="label">Transaction date</span><input className="field" type="date" name="transactionDate" defaultValue={initial.transactionDate} required /></label>
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-black text-ink">Payee</h2>
      <p className="mt-1 text-sm text-slate-500">Change the payee type or search the tenant directory. Received By follows the selected payee.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {PAYEE_TYPES.map((type) => <button key={type.value} type="button" onClick={() => changePayeeType(type.value)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-black ${payeeType === type.value ? "border-pine-700 bg-pine-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{type.label}</button>)}
      </div>
      {payeeType === "OTHER" ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Name</span><input className="field" value={otherPayeeName} onChange={(event) => setOtherPayeeName(event.target.value)} required /></label>
        <label><span className="label">Address</span><input className="field" name="address" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      </div> : <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><label className="label" htmlFor="petty-edit-payee-search">Search payee</label><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" /><input id="petty-edit-payee-search" className="field pl-10" type="search" value={payeeQuery} onChange={(event) => setPayeeQuery(event.target.value)} placeholder="Search name, account or property" /></div><select className="field mt-2" value={payeeEntityId} onChange={(event) => selectPayee(event.target.value)} required><option value="">Select a matching record</option>{matchingPayees.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
        <label><span className="label">Address</span><input className="field" name="address" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      </div>}
      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm"><b>Received By:</b> {receivedBy || "Select a payee"}</div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black text-ink">Particulars & amounts</h2><p className="mt-1 text-sm text-slate-500">Editing replaces the linked expense entries while preserving the voucher number and audit history.</p></div><button type="button" onClick={addItem} className="btn-secondary inline-flex min-h-11 items-center justify-center gap-2"><CirclePlus className="size-4" /> Add item</button></div>
      <div className="mt-5 space-y-3">
        {items.map((item, index) => <div key={item.key} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_44px] lg:items-end">
          <label><span className="label">Particular {index + 1}</span><select className="field bg-white" value={item.categoryId} onChange={(event) => updateItem(item.key, { categoryId: event.target.value, otherParticular: event.target.value === "OTHER" ? item.otherParticular : "" })} required><option value="">Select expense type</option>{expenseTypes.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="OTHER">Other — create new type</option></select></label>
          <label className={item.categoryId === "OTHER" ? "block" : "hidden"}><span className="label">Other particular</span><input className="field bg-white" value={item.otherParticular} onChange={(event) => updateItem(item.key, { otherParticular: event.target.value })} required={item.categoryId === "OTHER"} /></label>
          {item.categoryId !== "OTHER" && <div className="hidden lg:block" />}
          <label><span className="label">Amount</span><input className="field bg-white text-right font-black" type="number" min="0.01" step="0.01" value={item.amount} onChange={(event) => updateItem(item.key, { amount: event.target.value })} required /></label>
          <button type="button" onClick={() => removeItem(item.key)} disabled={items.length === 1} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-35" aria-label={`Remove particular ${index + 1}`}><Trash2 className="size-4" /></button>
        </div>)}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-pine-950 px-4 py-4 text-white"><span className="text-sm font-bold uppercase tracking-wide text-pine-100">Voucher total</span><strong className="text-xl font-black">{peso(total)}</strong></div>
    </section>

    {hasEmployeeCashAdvance && <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-black text-amber-950">Employee Cash Advance</h2>
      <p className="mt-1 text-sm text-amber-900">The linked Employee Loan and pending automatic deductions will be updated. A voucher already repaid or included in finalized payroll cannot be changed.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><label className="label" htmlFor="petty-edit-employee-search">Employee to deduct</label><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" /><input id="petty-edit-employee-search" className="field bg-white pl-10" type="search" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search employee" /></div><select className="field mt-2 bg-white" name="employeeAdvanceEmployeeId" value={employeeAdvanceEmployeeId} onChange={(event) => setEmployeeAdvanceEmployeeId(event.target.value)} required><option value="">Select employee</option>{matchingEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}</select></div>
        <label><span className="label">Deduction amount per cutoff</span><input className="field bg-white" name="deductionPerCutoff" type="number" min="0.01" step="0.01" value={deductionPerCutoff} onChange={(event) => setDeductionPerCutoff(event.target.value)} required /></label>
      </div>
    </section>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-black text-ink">Approval</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Approved by</span><select className="field" value={approverType} onChange={(event) => setApproverType(event.target.value as "ADMIN" | "OFFICER")}><option value="ADMIN">Current administrator · {currentAdminName}</option><option value="OFFICER">Organization officer</option></select></label>
        {approverType === "OFFICER" ? <label><span className="label">Officer</span><select className="field" name="approvingOfficerId" value={approvingOfficerId} onChange={(event) => setApprovingOfficerId(event.target.value)} required><option value="">Select officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.label} · {officer.position}</option>)}</select></label> : <div className="rounded-xl bg-slate-50 p-3 text-sm"><b>Approval:</b> {currentAdminName}</div>}
      </div>
    </section>

    <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-end">
      <Link className="btn-secondary inline-flex min-h-11 items-center justify-center" href={`/admin/petty-cash/${initial.id}`}>Cancel</Link>
      <button className="btn-primary inline-flex min-h-11 items-center justify-center gap-2" type="submit"><Save className="size-4" /> Save voucher changes</button>
    </div>
  </form>;
}
