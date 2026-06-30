import type { Bill, HomeownerProfile, User } from "@prisma/client";
import { saveBillAction } from "@/lib/actions/billing";
import { inputDate } from "@/lib/utils";
import { SubmitButton } from "@/components/ui";

type Homeowner = HomeownerProfile & { user: Pick<User, "name"> };

export function BillForm({ homeowners, bill }: { homeowners: Homeowner[]; bill?: Bill }) {
  return <form action={saveBillAction} className="card">
    {bill && <input type="hidden" name="id" value={bill.id} />}
    <div className="mb-5"><h2 className="text-lg font-black">{bill ? "Edit bill" : "Create individual bill"}</h2><p className="text-sm text-slate-500">Charges and dates for one homeowner.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Homeowner</label><select className="field" name="homeownerId" defaultValue={bill?.homeownerId} required><option value="">Select homeowner</option>{homeowners.map((h) => <option key={h.id} value={h.id}>{h.user.name} - Block {h.block}, Lot {h.lot}</option>)}</select></div>
      <div><label className="label">Billing month</label><input className="field" name="billingMonth" type="month" defaultValue={bill ? inputDate(bill.billingMonth).slice(0, 7) : new Date().toISOString().slice(0, 7)} required /></div>
      <div><label className="label">Due date</label><input className="field" name="dueDate" type="date" defaultValue={bill ? inputDate(bill.dueDate) : ""} required /></div>
      <div><label className="label">Base amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" defaultValue={bill ? String(bill.amount) : ""} required /></div>
      <div><label className="label">Penalty</label><input className="field" name="penalty" type="number" min="0" step="0.01" defaultValue={bill ? String(bill.penalty) : "0"} required /></div>
      {bill && <div><label className="label">Collection status</label><select className="field" name="status" defaultValue={bill.status}><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partial</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></select></div>}
      <div className={bill ? "" : "sm:col-span-2"}><label className="label">Notes</label><input className="field" name="notes" defaultValue={bill?.notes ?? ""} /></div>
    </div>
    <div className="mt-5"><SubmitButton>{bill ? "Save bill" : "Create bill"}</SubmitButton></div>
  </form>;
}
