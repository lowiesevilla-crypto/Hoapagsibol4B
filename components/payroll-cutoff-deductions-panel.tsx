"use client";

import { StandardTable } from "@/components/standard-table";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { deletePayrollDeductionAction, savePayrollDeductionAction } from "@/lib/actions/payroll";
import { money } from "@/lib/utils";
import { DeleteButton, SubmitButton } from "@/components/ui";

type EmployeeOption = {
  id: string;
  name: string;
  employeeNumber: string;
  salaryType: "DAILY" | "MONTHLY";
};

type DeductionTypeOption = {
  id: string;
  name: string;
  amount: number;
  applyToMonthly: boolean;
  applyToDaily: boolean;
};

type EmployeeLoanOption = {
  id: string;
  employeeId: string;
  type: string;
  description: string;
  balance: number;
};

type CutoffDeductionRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  deductionTypeId: string;
  deductionTypeName: string;
  deductionTypeAmount: number;
  employeeLoanId: string | null;
  employeeLoanType: string | null;
  employeeLoanDescription: string | null;
  employeeLoanBalance: number | null;
  amount: number;
  remarks: string | null;
};

export function PayrollCutoffDeductionsPanel({
  payrollId,
  payrollStatus,
  canWritePayroll,
  employees,
  deductionTypes,
  loans,
  deductions,
  initialEmployeeId = "",
}: {
  payrollId: string;
  payrollStatus: string;
  canWritePayroll: boolean;
  employees: EmployeeOption[];
  deductionTypes: DeductionTypeOption[];
  loans: EmployeeLoanOption[];
  deductions: CutoffDeductionRow[];
  initialEmployeeId?: string;
}) {
  const initialEmployeeExists = employees.some((employee) => employee.id === initialEmployeeId);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeExists ? initialEmployeeId : "");
  const [selectedLoanId, setSelectedLoanId] = useState("");
  const [selectedDeductionTypeId, setSelectedDeductionTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loadingEmployeeData, setLoadingEmployeeData] = useState(false);

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? null;
  const employeeLoans = useMemo(() => loans.filter((loan) => loan.employeeId === selectedEmployeeId), [loans, selectedEmployeeId]);
  const employeeDeductions = useMemo(() => deductions.filter((deduction) => deduction.employeeId === selectedEmployeeId), [deductions, selectedEmployeeId]);
  const applicableDeductionTypes = useMemo(() => {
    if (!selectedEmployee) return [];
    return deductionTypes.filter((deduction) => selectedEmployee.salaryType === "MONTHLY" ? deduction.applyToMonthly : deduction.applyToDaily);
  }, [deductionTypes, selectedEmployee]);
  const selectedLoan = employeeLoans.find((loan) => loan.id === selectedLoanId) ?? null;
  const employeeLoanBalance = employeeLoans.reduce((sum, loan) => sum + loan.balance, 0);

  useEffect(() => {
    setError("");
    setSelectedLoanId("");
    setLoadingEmployeeData(true);
    const timer = window.setTimeout(() => setLoadingEmployeeData(false), 180);
    return () => window.clearTimeout(timer);
  }, [selectedEmployeeId]);

  useEffect(() => {
    const first = applicableDeductionTypes[0];
    setSelectedDeductionTypeId(first?.id ?? "");
    setAmount(first ? String(first.amount) : "");
  }, [applicableDeductionTypes]);

  function validateAssignment(event: FormEvent<HTMLFormElement>) {
    setError("");
    if (!payrollId) {
      event.preventDefault();
      setError("Select a cutoff payroll period before saving a deduction.");
      return;
    }
    if (!selectedEmployeeId) {
      event.preventDefault();
      setError("Select an employee first. Employee balances and deductions are hidden until an employee is selected.");
      return;
    }
    if (!selectedDeductionTypeId) {
      event.preventDefault();
      setError("Select a deduction type that applies to this employee.");
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      event.preventDefault();
      setError("Enter a valid deduction amount greater than zero.");
      return;
    }
    if (selectedLoanId && !employeeLoans.some((loan) => loan.id === selectedLoanId)) {
      event.preventDefault();
      setError("The selected balance does not belong to this employee. Please choose this employee's own balance.");
      return;
    }
    if (selectedLoan && numericAmount > selectedLoan.balance + 0.005) {
      event.preventDefault();
      setError(`Amount cannot exceed the selected employee balance of ${money(selectedLoan.balance)}.`);
    }
  }

  const lockedMessage = !canWritePayroll
    ? "Your payroll role can view deductions but cannot change employee-specific payroll adjustments."
    : payrollStatus === "PAID"
      ? "Paid payroll is locked. Employee deductions cannot be changed."
      : "Return this payroll period to draft before changing employee deductions.";

  return <section className="card">
    <div className="mb-5">
      <p className="text-xs font-bold uppercase tracking-wider text-pine-600">Cutoff deductions</p>
      <h2 className="mt-1 text-lg font-black">Employee-specific deductions</h2>
      <p className="text-sm leading-6 text-slate-500">Select one employee first. The cutoff deduction list, loan balances, and Apply to Balance options below only show records that belong to that employee.</p>
    </div>

    <div className="mb-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr_.9fr]">
      <div>
        <label className="label">Selected employee</label>
        <select className="field" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
          <option value="">Select employee to load deductions</option>
          {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}
        </select>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Selected employee balance</p>
        <p className="mt-1 text-xl font-black text-ink">{selectedEmployeeId ? money(employeeLoanBalance) : "-"}</p>
        <p className="mt-1 text-xs text-slate-500">{selectedEmployeeId ? `${employeeLoans.length} open balance record(s)` : "No employee selected"}</p>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Cutoff deduction records</p>
        <p className="mt-1 text-xl font-black text-ink">{selectedEmployeeId ? employeeDeductions.length : "-"}</p>
        <p className="mt-1 text-xs text-slate-500">{selectedEmployeeId ? "For this employee only" : "Hidden until employee is selected"}</p>
      </div>
    </div>

    {loadingEmployeeData && <p className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-700">Loading selected employee deductions and balances...</p>}
    {error && <p className="mb-4 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</p>}

    {payrollStatus === "DRAFT" && canWritePayroll ? <div className="rounded-2xl border border-pine-100 bg-pine-50/40 p-4">
      {employees.length > 0 && deductionTypes.length > 0 ? <form action={savePayrollDeductionAction} onSubmit={validateAssignment} className="grid gap-3 lg:grid-cols-[1.1fr_1fr_1.2fr_.7fr_1fr_auto] lg:items-end">
        <input type="hidden" name="payrollId" value={payrollId} />
        <div>
          <label className="label">Employee</label>
          <select className="field" name="employeeId" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} required>
            <option value="">Select employee</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} - {employee.employeeNumber}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Deduction type</label>
          <select className="field" name="deductionTypeId" value={selectedDeductionTypeId} onChange={(event) => {
            const id = event.target.value;
            setSelectedDeductionTypeId(id);
            const deduction = applicableDeductionTypes.find((item) => item.id === id);
            if (deduction) setAmount(String(deduction.amount));
          }} required disabled={!selectedEmployeeId || !applicableDeductionTypes.length}>
            <option value="">{selectedEmployeeId ? "Select deduction" : "Select employee first"}</option>
            {applicableDeductionTypes.map((deduction) => <option key={deduction.id} value={deduction.id}>{deduction.name} - default {money(deduction.amount)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Apply to Balance</label>
          <select className="field" name="employeeLoanId" value={selectedLoanId} onChange={(event) => setSelectedLoanId(event.target.value)} disabled={!selectedEmployeeId}>
            <option value="">{selectedEmployeeId ? "Normal deduction" : "Select employee first"}</option>
            {employeeLoans.map((loan) => <option key={loan.id} value={loan.id}>{loanTypeLabel(loan.type)} - {loan.description} - balance {money(loan.balance)}</option>)}
          </select>
          {selectedEmployeeId && !employeeLoans.length && <p className="mt-1 text-xs text-slate-500">No open balances for this employee.</p>}
        </div>
        <div>
          <label className="label">Amount</label>
          <input className="field" name="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </div>
        <div>
          <label className="label">Remarks</label>
          <input className="field" name="remarks" placeholder="e.g. Cash advance for June 30 cutoff" />
        </div>
        <SubmitButton className="btn-secondary">Assign deduction</SubmitButton>
      </form> : <p className="text-sm text-slate-500">Add at least one active employee and one active deduction type before assigning deductions.</p>}
    </div> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{lockedMessage}</div>}

    {!selectedEmployeeId && <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Select an employee to view cutoff deductions, existing balances, and Apply to Balance options.</div>}

    {selectedEmployeeId && !loadingEmployeeData && <div className="mt-5 table-wrap">
      <StandardTable><table className="data-table">
        <thead><tr><th>Employee</th><th>Deduction</th><th>Loan balance</th><th>Amount</th><th>Remarks</th><th></th></tr></thead>
        <tbody>
          {employeeDeductions.map((deduction) => <tr key={deduction.id}>
            <td><p className="font-bold">{deduction.employeeName}</p><p className="text-xs text-slate-400">{deduction.employeeNumber}</p></td>
            <td><p className="font-bold">{deduction.deductionTypeName}</p><p className="text-xs text-slate-400">Default {money(deduction.deductionTypeAmount)}</p></td>
            <td>{deduction.employeeLoanId ? <div><p className="font-bold">{loanTypeLabel(deduction.employeeLoanType ?? "")}</p><p className="text-xs text-slate-500">{deduction.employeeLoanDescription}</p><p className="text-xs font-bold text-pine-700">Current balance {money(deduction.employeeLoanBalance ?? 0)}</p></div> : <span className="text-xs text-slate-400">Not linked</span>}</td>
            <td>{money(deduction.amount)}</td>
            <td>{deduction.remarks || "No remarks."}</td>
            <td>
              {payrollStatus === "DRAFT" && canWritePayroll ? <details className="min-w-64 rounded-xl border border-slate-100 bg-white p-2">
                <summary className="cursor-pointer list-none text-sm font-bold text-pine-700">Edit</summary>
                <form action={savePayrollDeductionAction} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <input type="hidden" name="payrollId" value={payrollId} />
                  <input type="hidden" name="employeeId" value={deduction.employeeId} />
                  <input type="hidden" name="deductionTypeId" value={deduction.deductionTypeId} />
                  <div><label className="label">Apply to Balance</label><select className="field" name="employeeLoanId" defaultValue={deduction.employeeLoanId ?? ""}><option value="">Normal deduction</option>{deduction.employeeLoanId && <option value={deduction.employeeLoanId}>{loanTypeLabel(deduction.employeeLoanType ?? "")} - balance {money(deduction.employeeLoanBalance ?? 0)}</option>}{employeeLoans.filter((loan) => loan.id !== deduction.employeeLoanId).map((loan) => <option key={loan.id} value={loan.id}>{loanTypeLabel(loan.type)} - {loan.description} - balance {money(loan.balance)}</option>)}</select></div>
                  <div><label className="label">Amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" defaultValue={String(deduction.amount)} required /></div>
                  <div><label className="label">Remarks</label><input className="field" name="remarks" defaultValue={deduction.remarks ?? ""} /></div>
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton className="btn-secondary">Save</SubmitButton>
                  </div>
                </form>
                <form action={deletePayrollDeductionAction} className="mt-2">
                  <input type="hidden" name="id" value={deduction.id} />
                  <input type="hidden" name="payrollId" value={payrollId} />
                  <input type="hidden" name="employeeId" value={deduction.employeeId} />
                  <DeleteButton label="Remove" />
                </form>
              </details> : <span className="text-xs text-slate-400">Locked</span>}
            </td>
          </tr>)}
          {!employeeDeductions.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No cutoff deductions have been assigned for the selected employee.</td></tr>}
        </tbody>
      </table></StandardTable>
    </div>}
  </section>;
}

function loanTypeLabel(type: string) {
  return type.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
