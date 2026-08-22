import Link from "next/link";
import { Building2, CircleDollarSign, FileWarning, KeyRound } from "lucide-react";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { SearchableSelect } from "@/components/searchable-select";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SearchInput, SubmitButton } from "@/components/ui";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { allocateRentalPaymentAction, endRentalAgreementAction, generateRentalInvoicesAction, saveRentalAgreementAction, saveRentalAssetAction, saveRenterAction } from "@/lib/actions/rentals";
import { prisma } from "@/lib/db";
import { inputDate, money, shortDate } from "@/lib/utils";

type AssetRow = { id: string; code: string; name: string; type: string; location: string | null; defaultRate: Prisma.Decimal | number | string; status: string };
type RenterRow = { id: string; fullName: string; email: string | null; phone: string | null; status: string; homeownerId: string | null; homeownerName: string | null };
type AgreementRow = { id: string; assetId: string; renterId: string; assetCode: string; assetName: string; renterName: string; startDate: Date; endDate: Date | null; monthlyRate: Prisma.Decimal | number | string; securityDeposit: Prisma.Decimal | number | string; billingDay: number; dueDay: number; status: string };
type InvoiceRow = { id: string; invoiceNumber: string; chargeType: string; periodStart: Date; periodEnd: Date; dueDate: Date; amount: Prisma.Decimal | number | string; amountPaid: Prisma.Decimal | number | string; balance: Prisma.Decimal | number | string; status: string; assetCode: string; assetName: string; renterName: string; renterHomeownerId: string | null };
type CollectionRow = { id: string; receiptNumber: string; payerType: string; payerName: string | null; homeownerId: string | null; amount: Prisma.Decimal | number | string; allocated: Prisma.Decimal | number | string; available: Prisma.Decimal | number | string };

function monthInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

export default async function RentalsPage() {
  const admin = await requirePermission(Permission.BILLING_READ);
  const today = inputDate(new Date());
  const [assets, renters, agreements, invoices, collections, homeowners] = await Promise.all([
    prisma.$queryRaw<AssetRow[]>(Prisma.sql`SELECT id,code,name,type,location,defaultRate,status FROM RentalAsset WHERE tenantId=${admin.tenantId} ORDER BY status='AVAILABLE' DESC,type,code`),
    prisma.$queryRaw<RenterRow[]>(Prisma.sql`
      SELECT r.id,r.fullName,r.email,r.phone,r.status,r.homeownerId,u.name AS homeownerName
      FROM Renter r LEFT JOIN HomeownerProfile h ON h.tenantId=r.tenantId AND h.id=r.homeownerId
      LEFT JOIN User u ON u.id=h.userId
      WHERE r.tenantId=${admin.tenantId} ORDER BY r.status='ACTIVE' DESC,r.fullName
    `),
    prisma.$queryRaw<AgreementRow[]>(Prisma.sql`
      SELECT a.id,a.assetId,a.renterId,ra.code AS assetCode,ra.name AS assetName,r.fullName AS renterName,a.startDate,a.endDate,a.monthlyRate,a.securityDeposit,a.billingDay,a.dueDay,a.status
      FROM RentalAgreement a JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
      JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
      WHERE a.tenantId=${admin.tenantId} ORDER BY a.status='ACTIVE' DESC,a.startDate DESC
    `),
    prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
      SELECT i.id,i.invoiceNumber,i.chargeType,i.periodStart,i.periodEnd,i.dueDate,i.amount,i.amountPaid,i.balance,
        CASE WHEN i.status IN ('OPEN','PARTIAL') AND i.dueDate<CURDATE() AND i.balance>0 THEN 'OVERDUE' ELSE i.status END AS status,
        ra.code AS assetCode,ra.name AS assetName,r.fullName AS renterName,r.homeownerId AS renterHomeownerId
      FROM RentalInvoice i JOIN RentalAgreement a ON a.tenantId=i.tenantId AND a.id=i.agreementId
      JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
      JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
      WHERE i.tenantId=${admin.tenantId} ORDER BY i.dueDate DESC,i.createdAt DESC LIMIT 250
    `),
    prisma.$queryRaw<CollectionRow[]>(Prisma.sql`
      SELECT c.id,c.receiptNumber,c.payerType,c.payerName,c.homeownerId,c.amount,
        COALESCE(SUM(a.amount),0) AS allocated,(c.amount-COALESCE(SUM(a.amount),0)) AS available
      FROM Collection c LEFT JOIN HomeownerProfile h ON h.tenantId=c.tenantId AND h.id=c.homeownerId
      LEFT JOIN User u ON u.id=h.userId
      LEFT JOIN RentalPaymentAllocation a ON a.tenantId=c.tenantId AND a.collectionId=c.id
      WHERE c.tenantId=${admin.tenantId} AND c.type='OTHER' AND c.refundable=FALSE AND c.payerType IN ('RENTER','HOMEOWNER')
      GROUP BY c.id,c.receiptNumber,c.payerType,c.payerName,c.homeownerId,c.amount HAVING available>0 ORDER BY c.collectionDate DESC LIMIT 5000
    `),
    prisma.homeownerProfile.findMany({ where: { tenantId: admin.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } }, take: 5000 }),
  ]);

  const activeAgreements = agreements.filter((item) => item.status === "ACTIVE");
  const availableAssets = assets.filter((item) => item.status === "AVAILABLE");
  const openInvoices = invoices.filter((item) => !["PAID", "VOID"].includes(item.status));
  const outstanding = openInvoices.reduce((sum, item) => sum + Number(item.balance), 0);
  const overdue = openInvoices.filter((item) => item.status === "OVERDUE").reduce((sum, item) => sum + Number(item.balance), 0);

  return <>
    <PageHeader eyebrow="Finance · Rental operations" title="Rental Management" description="Manage stalls, parking and rentable spaces, bill renters, track overdue rent, and reconcile renter collections to rental receivables." />

    <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Rental assets" value={String(assets.length)} note={`${availableAssets.length} available · ${activeAgreements.length} occupied`} icon={Building2} />
      <StatCard label="Active renters" value={String(renters.filter((item) => item.status === "ACTIVE").length)} note="Homeowner-linked or external" icon={KeyRound} />
      <StatCard label="Outstanding rent & deposits" value={money(outstanding)} note={`${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`} icon={CircleDollarSign} />
      <StatCard label="Overdue" value={money(overdue)} note={`${openInvoices.filter((item) => item.status === "OVERDUE").length} overdue invoice${openInvoices.filter((item) => item.status === "OVERDUE").length === 1 ? "" : "s"}`} icon={FileWarning} />
    </section>

    <section className="mb-6 grid gap-5 xl:grid-cols-3">
      <form action={saveRentalAssetAction} className="card space-y-3">
        <div><p className="eyebrow">Inventory</p><h2 className="text-lg font-black">Add rental asset</h2></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Asset code<input className="field" name="code" placeholder="STALL-01" required /></label><label className="label">Type<select className="field" name="type" defaultValue="STALL"><option value="STALL">Stall</option><option value="PARKING">Parking</option><option value="SPACE">Space</option><option value="OTHER">Other</option></select></label></div>
        <label className="label">Asset name<input className="field" name="name" placeholder="Market Stall 01" required /></label>
        <label className="label">Location<input className="field" name="location" placeholder="Clubhouse / Gate / Phase" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Default monthly rate<input className="field" name="defaultRate" type="number" min="0" step="0.01" defaultValue="0" required /></label><label className="label">Status<select className="field" name="status" defaultValue="AVAILABLE"><option value="AVAILABLE">Available</option><option value="INACTIVE">Inactive</option></select></label></div>
        <label className="label">Notes<textarea className="field min-h-20" name="notes" /></label><SubmitButton className="btn-primary w-full">Save asset</SubmitButton>
      </form>

      <form action={saveRenterAction} className="card space-y-3">
        <div><p className="eyebrow">Tenant record</p><h2 className="text-lg font-black">Add renter</h2></div>
        <label className="label">Renter name<input className="field" name="fullName" placeholder="Full renter / business name" required /></label>
        <SearchableSelect name="homeownerId" label="Existing homeowner link (optional)" items={homeowners.map((owner) => ({ id: owner.id, label: `${owner.user.name} · Block ${owner.block} Lot ${owner.lot}`, search: `${owner.user.name} block ${owner.block} lot ${owner.lot} ${owner.address}`.toLowerCase() }))} placeholder="Search homeowner name, block or lot" />
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Email<input className="field" type="email" name="email" /></label><label className="label">Phone<input className="field" name="phone" /></label></div>
        <label className="label">Address<textarea className="field min-h-20" name="address" /></label><input type="hidden" name="status" value="ACTIVE" /><SubmitButton className="btn-primary w-full">Save renter</SubmitButton>
      </form>

      <form action={saveRentalAgreementAction} className="card space-y-3">
        <div><p className="eyebrow">Occupancy & billing</p><h2 className="text-lg font-black">Create agreement</h2></div>
        <label className="label">Available asset<select className="field" name="assetId" required defaultValue=""><option value="" disabled>Select asset</option>{availableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name} · {money(asset.defaultRate)}/mo</option>)}</select></label>
        <label className="label">Renter<select className="field" name="renterId" required defaultValue=""><option value="" disabled>Select renter</option>{renters.filter((item) => item.status === "ACTIVE").map((renter) => <option key={renter.id} value={renter.id}>{renter.fullName}{renter.homeownerName ? ` · ${renter.homeownerName}` : " · external"}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Start date<input className="field" type="date" name="startDate" defaultValue={today} required /></label><label className="label">End date<input className="field" type="date" name="endDate" /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Monthly rate<input className="field" type="number" min="0.01" step="0.01" name="monthlyRate" required /></label><label className="label">Security deposit<input className="field" type="number" min="0" step="0.01" name="securityDeposit" defaultValue="0" required /></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Billing day<input className="field" type="number" min="1" max="28" name="billingDay" defaultValue="1" required /></label><label className="label">Due day<input className="field" type="number" min="1" max="28" name="dueDay" defaultValue="5" required /></label></div>
        <label className="label">Notes<textarea className="field min-h-16" name="notes" /></label><SubmitButton className="btn-primary w-full">Activate agreement</SubmitButton>
      </form>
    </section>

    <section className="card mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Recurring receivables</p><h2 className="text-lg font-black">Generate monthly rent</h2><p className="text-sm text-slate-500">Creates one idempotent rent invoice per active agreement and month. Existing invoices are not duplicated.</p></div><form action={generateRentalInvoicesAction} className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="label">Billing month<input className="field min-w-44" type="month" name="billingMonth" defaultValue={monthInput()} required /></label><SubmitButton className="btn-primary">Generate invoices</SubmitButton></form></div>
    </section>

    <section className="mb-6"><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Rental receivables</p><h2 className="text-xl font-black">Invoices & payment reconciliation</h2><p className="text-sm text-slate-500">Record renter payment creates the official cash receipt. Apply existing receipt links that receipt to the matching rental invoice.</p></div><div className="flex items-center gap-3"><Link href="/admin/collections" className="btn-secondary">Record renter payment</Link><SearchInput placeholder="Search renter, asset, invoice or status" /></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Invoice</th><th>Renter / asset</th><th>Period / due</th><th>Charge</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th><th>Payment</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} data-search={`${invoice.invoiceNumber} ${invoice.renterName} ${invoice.assetCode} ${invoice.assetName} ${invoice.chargeType} ${invoice.status}`.toLowerCase()}><td className="font-bold">{invoice.invoiceNumber}</td><td><p className="font-bold">{invoice.renterName}</p><p className="text-xs text-slate-400">{invoice.assetCode} · {invoice.assetName}</p></td><td><p>{shortDate(invoice.periodStart)}{invoice.periodEnd.getTime() !== invoice.periodStart.getTime() ? ` – ${shortDate(invoice.periodEnd)}` : ""}</p><p className="text-xs text-slate-400">Due {shortDate(invoice.dueDate)}</p></td><td>{label(invoice.chargeType)}{invoice.chargeType === "SECURITY_DEPOSIT" && <p className="text-xs font-bold text-amber-700">Liability, not income</p>}</td><td className="font-black">{money(invoice.amount)}</td><td>{money(invoice.amountPaid)}</td><td className="font-black">{money(invoice.balance)}</td><td><StatusBadge status={invoice.status} /></td><td>{!["PAID","VOID"].includes(invoice.status) ? <form action={allocateRentalPaymentAction} className="min-w-64 space-y-2"><input type="hidden" name="invoiceId" value={invoice.id} /><SearchableSelect name="collectionId" label="Apply existing receipt" items={collections.filter((collection) => (collection.payerType === "RENTER" && Boolean(collection.payerName) && collection.payerName!.trim().toLocaleLowerCase("en-PH") === invoice.renterName.trim().toLocaleLowerCase("en-PH")) || (collection.payerType === "HOMEOWNER" && Boolean(invoice.renterHomeownerId) && collection.homeownerId === invoice.renterHomeownerId)).map((collection) => ({ id: collection.id, label: `${collection.receiptNumber} · ${collection.payerName || invoice.renterName} · ${money(collection.available)} available`, search: `${collection.receiptNumber} ${collection.payerName || invoice.renterName} ${Number(collection.available).toFixed(2)}`.toLowerCase() }))} placeholder="Search receipt number, renter or amount" required /><div className="flex gap-2"><input className="field min-w-28" type="number" min="0.01" max={Number(invoice.balance)} step="0.01" name="amount" defaultValue={Number(invoice.balance).toFixed(2)} required /><SubmitButton className="btn-secondary whitespace-nowrap">Allocate</SubmitButton></div></form> : <span className="text-xs font-bold text-emerald-700">Reconciled</span>}</td></tr>)}{!invoices.length && <tr><td colSpan={9} className="py-12 text-center text-slate-500">No rental invoices yet. Create an agreement and generate the billing month.</td></tr>}</tbody></table></div>
    </section>

    <section className="mb-6"><div className="mb-3"><p className="eyebrow">Occupancy</p><h2 className="text-xl font-black">Rental agreements</h2></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Asset</th><th>Renter</th><th>Term</th><th>Rate</th><th>Deposit</th><th>Billing</th><th>Status</th><th></th></tr></thead><tbody>{agreements.map((agreement) => <tr key={agreement.id}><td><p className="font-bold">{agreement.assetCode}</p><p className="text-xs text-slate-400">{agreement.assetName}</p></td><td className="font-bold">{agreement.renterName}</td><td>{shortDate(agreement.startDate)}{agreement.endDate ? ` – ${shortDate(agreement.endDate)}` : " – ongoing"}</td><td className="font-black">{money(agreement.monthlyRate)}</td><td>{money(agreement.securityDeposit)}</td><td>Day {agreement.billingDay}<p className="text-xs text-slate-400">Due day {agreement.dueDay}</p></td><td><StatusBadge status={agreement.status} /></td><td>{agreement.status === "ACTIVE" && <form action={endRentalAgreementAction} className="flex min-w-56 gap-2"><input type="hidden" name="agreementId" value={agreement.id} /><input className="field" type="date" name="endDate" defaultValue={today} required /><SubmitButton className="btn-secondary">End</SubmitButton></form>}</td></tr>)}{!agreements.length && <tr><td colSpan={8} className="py-10 text-center text-slate-500">No rental agreements have been created.</td></tr>}</tbody></table></div></section>

    <section><div className="mb-3"><p className="eyebrow">Inventory & renter register</p><h2 className="text-xl font-black">Assets and renters</h2></div><div className="grid gap-5 xl:grid-cols-2"><div className="table-wrap"><table className="data-table"><thead><tr><th>Asset</th><th>Type</th><th>Location</th><th>Default rate</th><th>Status</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><td><p className="font-bold">{asset.code}</p><p className="text-xs text-slate-400">{asset.name}</p></td><td>{label(asset.type)}</td><td>{asset.location || "-"}</td><td className="font-black">{money(asset.defaultRate)}</td><td><StatusBadge status={asset.status} /></td></tr>)}{!assets.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">No rental assets yet.</td></tr>}</tbody></table></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Renter</th><th>Contact</th><th>HOA link</th><th>Status</th></tr></thead><tbody>{renters.map((renter) => <tr key={renter.id}><td className="font-bold">{renter.fullName}</td><td><p>{renter.phone || "-"}</p><p className="text-xs text-slate-400">{renter.email || ""}</p></td><td>{renter.homeownerName || "External renter"}</td><td><StatusBadge status={renter.status} /></td></tr>)}{!renters.length && <tr><td colSpan={4} className="py-8 text-center text-slate-500">No renters yet.</td></tr>}</tbody></table></div></div></section>
  </>;
}
