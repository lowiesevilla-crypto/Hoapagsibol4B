import type { Bill, HomeownerProfile, User } from "@prisma/client";
import { SearchableHomeownerSelect } from "@/components/searchable-homeowner-select";
import { saveBillAction } from "@/lib/actions/billing";
import { inputDate } from "@/lib/utils";
import { SubmitButton } from "@/components/ui";

type Homeowner = HomeownerProfile & { user: Pick<User, "name" | "email"> };

export function BillForm({ homeowners, bill }: { homeowners: Homeowner[]; bill?: Bill }) {
  if (!bill) return <IndividualBillingPreviewForm homeowners={homeowners} />;

  return <form action={saveBillAction} className="card">
    {bill && <input type="hidden" name="id" value={bill.id} />}
    <div className="mb-5"><h2 className="text-lg font-black">Edit bill</h2><p className="text-sm text-slate-500">Adjust an existing billing record without changing the original generation policy.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Homeowner</label><select className="field" name="homeownerId" defaultValue={bill.homeownerId} required><option value="">Select homeowner</option>{homeowners.map((h) => <option key={h.id} value={h.id}>{h.user.name} - Block {h.block}, Lot {h.lot}</option>)}</select></div>
      <div><label className="label">Billing month</label><input className="field" name="billingMonth" type="month" defaultValue={inputDate(bill.billingMonth).slice(0, 7)} required /></div>
      <div><label className="label">Due date</label><input className="field" name="dueDate" type="date" defaultValue={inputDate(bill.dueDate)} required /></div>
      <div><label className="label">Base amount</label><input className="field" name="amount" type="number" min="0.01" step="0.01" defaultValue={String(bill.amount)} required /></div>
      <div><label className="label">Penalty</label><input className="field" name="penalty" type="number" min="0" step="0.01" defaultValue={String(bill.penalty)} required /></div>
      <div><label className="label">Collection status</label><select className="field" name="status" defaultValue={bill.status}><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partial</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></select></div>
      <div><label className="label">Notes</label><input className="field" name="notes" defaultValue={bill.notes ?? ""} /></div>
    </div>
    <div className="mt-5"><SubmitButton>Save bill</SubmitButton></div>
  </form>;
}

function IndividualBillingPreviewForm({ homeowners }: { homeowners: Homeowner[] }) {
  const now = new Date();
  const options = homeowners.map((homeowner) => ({
    id: homeowner.id,
    label: `${homeowner.user.name} - Block ${homeowner.block}, Lot ${homeowner.lot}`,
    search: `${homeowner.user.name} ${homeowner.user.email} block ${homeowner.block} lot ${homeowner.lot} account ${homeowner.id} ${homeowner.id}`.toLowerCase(),
  }));
  return <form method="get" action="/admin/billing" className="card">
    <input type="hidden" name="preview" value="1" />
    <input type="hidden" name="scope" value="HOMEOWNER" />
    <div className="mb-5"><h2 className="text-lg font-black">Create individual bill</h2><p className="text-sm text-slate-500">Preview one homeowner through the Billing Rules engine before generating a bill.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><SearchableHomeownerSelect name="homeownerId" label="Homeowner" homeowners={options} required searchEndpoint="/api/admin/homeowners/search" /></div>
      <div><label className="label">Coverage month</label><select className="field" name="coverageMonth" defaultValue={now.getUTCMonth() + 1}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>)}</select></div>
      <div><label className="label">Coverage year</label><input className="field" name="coverageYear" type="number" min="1900" max="2200" defaultValue={now.getUTCFullYear()} required /></div>
    </div>
    <div className="mt-5"><SubmitButton>Preview individual bill</SubmitButton></div>
  </form>;
}

function monthName(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });
}
