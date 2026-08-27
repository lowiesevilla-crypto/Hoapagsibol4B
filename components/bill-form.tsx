import type { Bill, HomeownerProfile, User } from "@prisma/client";
import { BillingAutomationFormLock } from "@/components/billing-automation-form-lock";
import { SearchableHomeownerSelect } from "@/components/searchable-homeowner-select";
import { saveBillAction } from "@/lib/actions/billing";
import { inputDate } from "@/lib/utils";
import { SubmitButton } from "@/components/ui";

type Homeowner = HomeownerProfile & { user: Pick<User, "name" | "email"> };
type EditableBill = Bill & { homeowner: Homeowner };

export function BillForm({ homeowners, bill, searchQuery = "" }: { homeowners: Homeowner[]; bill?: EditableBill; searchQuery?: string }) {
  if (!bill) return <IndividualBillingPreviewForm homeowners={homeowners} />;

  const editHomeowners = homeowners.some((homeowner) => homeowner.id === bill.homeownerId)
    ? homeowners
    : [bill.homeowner, ...homeowners];
  const editOptions = editHomeowners.map((homeowner) => ({
    id: homeowner.id,
    label: `${homeowner.user.name} - Block ${homeowner.block}, Lot ${homeowner.lot}${homeowner.status === "ACTIVE" ? "" : ` - ${homeowner.status}`}`,
    search: `${homeowner.user.name} ${homeowner.user.email} ${homeowner.accountNumber ?? ""} block ${homeowner.block} lot ${homeowner.lot} ${homeowner.phase ?? ""} ${homeowner.address ?? ""} account ${homeowner.id} ${homeowner.status}`.toLowerCase(),
  }));

  return <form action={saveBillAction} className="card">
    <input type="hidden" name="id" value={bill.id} />
    {searchQuery && <input type="hidden" name="returnQ" value={searchQuery} />}
    <div className="mb-5"><h2 className="text-lg font-black">Edit bill</h2><p className="text-sm text-slate-500">Adjust an existing billing record without changing the original generation policy. The homeowner currently assigned to this bill is pre-selected below.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <SearchableHomeownerSelect
          name="homeownerId"
          label="Homeowner"
          homeowners={editOptions}
          defaultValue={bill.homeownerId}
          required
          placeholder="Search all tenant homeowners by name, account, block, lot or email"
          searchEndpoint="/api/admin/billing/homeowners/search"
        />
        <p className="mt-2 text-xs text-slate-500">Current bill owner: <strong className="text-slate-700">{bill.homeowner.user.name}</strong> · Block {bill.homeowner.block}, Lot {bill.homeowner.lot}{bill.homeowner.accountNumber ? ` · ${bill.homeowner.accountNumber}` : ""}. Search includes active and inactive tenant homeowner records so migrated/opening-balance bills remain editable.</p>
      </div>
      <div><label className="label" htmlFor="edit-bill-month">Billing month</label><input id="edit-bill-month" className="field" name="billingMonth" type="month" defaultValue={inputDate(bill.billingMonth).slice(0, 7)} required /></div>
      <div><label className="label" htmlFor="edit-bill-due-date">Due date</label><input id="edit-bill-due-date" className="field" name="dueDate" type="date" defaultValue={inputDate(bill.dueDate)} required /></div>
      <div><label className="label" htmlFor="edit-bill-amount">Base amount</label><input id="edit-bill-amount" className="field" name="amount" type="number" min="0.01" step="0.01" defaultValue={String(bill.amount)} required /></div>
      <div><label className="label" htmlFor="edit-bill-penalty">Penalty</label><input id="edit-bill-penalty" className="field" name="penalty" type="number" min="0" step="0.01" defaultValue={String(bill.penalty)} required /></div>
      <div><label className="label" htmlFor="edit-bill-status">Collection status</label><select id="edit-bill-status" className="field" name="status" defaultValue={bill.status}><option value="UNPAID">Unpaid</option><option value="PARTIAL">Partial</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid</option></select></div>
      <div><label className="label" htmlFor="edit-bill-notes">Notes</label><input id="edit-bill-notes" className="field" name="notes" defaultValue={bill.notes ?? ""} /></div>
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
    <BillingAutomationFormLock />
    <div className="mb-5"><h2 className="text-lg font-black">Create individual bill</h2><p className="text-sm text-slate-500">Preview one homeowner through the Billing Rules engine before generating a bill. Manual creation is disabled while Automatic Billing is ON.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><SearchableHomeownerSelect name="homeownerId" label="Homeowner" homeowners={options} required searchEndpoint="/api/admin/homeowners/search" /></div>
      <div><label className="label" htmlFor="individual-bill-coverage-month">Coverage month</label><select id="individual-bill-coverage-month" className="field" name="coverageMonth" defaultValue={now.getUTCMonth() + 1}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>)}</select></div>
      <div><label className="label" htmlFor="individual-bill-coverage-year">Coverage year</label><input id="individual-bill-coverage-year" className="field" name="coverageYear" type="number" min="1900" max="2200" defaultValue={now.getUTCFullYear()} required /></div>
    </div>
    <div className="mt-5"><SubmitButton>Preview individual bill</SubmitButton></div>
  </form>;
}

function monthName(month: number) {
  return new Date(Date.UTC(2026, month - 1, 1)).toLocaleDateString("en-PH", { month: "long", timeZone: "UTC" });
}
