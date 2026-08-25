import { StandardTable } from "@/components/standard-table";
import Link from "next/link";
import { Building2, CircleDollarSign, FileWarning, KeyRound } from "lucide-react";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { RentalPaymentForm, RentalReconcileControl } from "@/components/rental-payment-workflow";
import { RentalAgreementActions, RentalAssetActions, RenterRecordActions } from "@/components/rental-record-actions";
import { SearchableHomeownerSelect } from "@/components/searchable-homeowner-select";
import { SearchableSelect } from "@/components/searchable-select";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SearchInput, SubmitButton } from "@/components/ui";
import { allocateRentalPaymentAction, saveRentalAgreementAction, saveRentalAssetAction, saveRenterAction } from "@/lib/actions/rentals";
import { generateRentalInvoicesAndReconcileAction } from "@/lib/actions/rental-workflow";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { inputDate, money, shortDate } from "@/lib/utils";

type AssetRow = { id: string; code: string; name: string; type: string; location: string | null; defaultRate: Prisma.Decimal | number | string; status: string; notes: string | null; agreementCount: bigint | number };
type RenterRow = { id: string; fullName: string; email: string | null; phone: string | null; address: string | null; status: string; homeownerId: string | null; homeownerName: string | null; agreementCount: bigint | number; currentAssetCode: string | null; currentAssetName: string | null; outstandingBalance: Prisma.Decimal | number | string };
type AgreementRow = { id: string; assetId: string; renterId: string; assetCode: string; assetName: string; renterName: string; startDate: Date; endDate: Date | null; monthlyRate: Prisma.Decimal | number | string; securityDeposit: Prisma.Decimal | number | string; billingDay: number; dueDay: number; status: string; notes: string | null; invoiceCount: bigint | number };
type InvoiceRow = { id: string; invoiceNumber: string; chargeType: string; periodStart: Date; periodEnd: Date; dueDate: Date; amount: Prisma.Decimal | number | string; amountPaid: Prisma.Decimal | number | string; balance: Prisma.Decimal | number | string; status: string; assetCode: string; assetName: string; renterName: string; renterHomeownerId: string | null };
type CollectionRow = { id: string; receiptNumber: string; description: string | null; payerType: string; payerName: string | null; homeownerId: string | null; homeownerName: string | null; amount: Prisma.Decimal | number | string; allocated: Prisma.Decimal | number | string; available: Prisma.Decimal | number | string; refundable: boolean; amountRefunded: Prisma.Decimal | number | string; amountForfeited: Prisma.Decimal | number | string };
type RentalView = "overview" | "assets" | "renters" | "agreements" | "billing" | "payments" | "reconciliation";

const rentalViews: Array<{ key: RentalView; label: string; description: string }> = [
  { key: "overview", label: "Overview", description: "Rental operations at a glance" },
  { key: "assets", label: "Assets", description: "Parking, stalls, spaces and other rentable inventory" },
  { key: "renters", label: "Renters", description: "Homeowner-linked and external renter records" },
  { key: "agreements", label: "Agreements", description: "Assign assets, terms and recurring rental rules" },
  { key: "billing", label: "Billing", description: "Generate and monitor rental receivables" },
  { key: "payments", label: "Payments", description: "Record rental cash and maintain advance credits" },
  { key: "reconciliation", label: "Reconciliation", description: "Automatically or manually match receipts to open rental invoices" },
];

function monthInput(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit" }).format(date).slice(0, 7);
}
function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function normalizePersonName(value: string | null | undefined) {
  return (value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-PH").replace(/[^a-z0-9]+/g, " ").trim();
}
function receiptMatchesRenter(collection: CollectionRow, invoice: InvoiceRow) {
  const renterNameKey = normalizePersonName(invoice.renterName);
  if (collection.payerType === "RENTER") return normalizePersonName(collection.payerName) === renterNameKey;
  if (collection.payerType !== "HOMEOWNER") return false;
  if (invoice.renterHomeownerId) return collection.homeownerId === invoice.renterHomeownerId;
  return Boolean(collection.homeownerId && normalizePersonName(collection.homeownerName) === renterNameKey);
}
function receiptCanSettleInvoice(collection: CollectionRow, invoice: InvoiceRow) {
  if (!receiptMatchesRenter(collection, invoice)) return false;
  if (invoice.chargeType === "SECURITY_DEPOSIT") return Number(collection.amountRefunded) === 0 && Number(collection.amountForfeited) === 0;
  return !collection.refundable;
}
function receiptMatchesRenterRecord(collection: CollectionRow, renter: RenterRow) {
  if (renter.homeownerId) return collection.payerType === "HOMEOWNER" && collection.homeownerId === renter.homeownerId;
  return collection.payerType === "RENTER" && normalizePersonName(collection.payerName) === normalizePersonName(renter.fullName);
}
function viewHref(view: RentalView) { return `/admin/rentals?view=${view}`; }

export default async function RentalsPage({ searchParams }: { searchParams: Promise<{ view?: string; source?: string }> }) {
  const admin = await requirePermission(Permission.BILLING_READ);
  const params = await searchParams;
  const requestedView = params.view as RentalView | undefined;
  const view: RentalView = rentalViews.some((item) => item.key === requestedView) ? requestedView! : "overview";
  const openedFromCollections = params.source === "collections";
  const today = inputDate(new Date());

  const [assets, renters, agreements, invoices, collections, homeowners] = await Promise.all([
    prisma.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT ra.id,ra.code,ra.name,ra.type,ra.location,ra.defaultRate,ra.status,ra.notes,
        (SELECT COUNT(*) FROM RentalAgreement a WHERE a.tenantId=ra.tenantId AND a.assetId=ra.id) AS agreementCount
      FROM RentalAsset ra WHERE ra.tenantId=${admin.tenantId} ORDER BY ra.status='AVAILABLE' DESC,ra.type,ra.code
    `),
    prisma.$queryRaw<RenterRow[]>(Prisma.sql`
      SELECT r.id,r.fullName,r.email,r.phone,r.address,r.status,r.homeownerId,u.name AS homeownerName,
        (SELECT COUNT(*) FROM RentalAgreement a WHERE a.tenantId=r.tenantId AND a.renterId=r.id) AS agreementCount,
        (SELECT ra.code FROM RentalAgreement a JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId WHERE a.tenantId=r.tenantId AND a.renterId=r.id AND a.status='ACTIVE' ORDER BY a.startDate DESC LIMIT 1) AS currentAssetCode,
        (SELECT ra.name FROM RentalAgreement a JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId WHERE a.tenantId=r.tenantId AND a.renterId=r.id AND a.status='ACTIVE' ORDER BY a.startDate DESC LIMIT 1) AS currentAssetName,
        (SELECT COALESCE(SUM(i.balance),0) FROM RentalAgreement a JOIN RentalInvoice i ON i.tenantId=a.tenantId AND i.agreementId=a.id WHERE a.tenantId=r.tenantId AND a.renterId=r.id AND i.status<>'VOID') AS outstandingBalance
      FROM Renter r LEFT JOIN HomeownerProfile h ON h.tenantId=r.tenantId AND h.id=r.homeownerId
      LEFT JOIN User u ON u.id=h.userId WHERE r.tenantId=${admin.tenantId} ORDER BY r.status='ACTIVE' DESC,r.fullName
    `),
    prisma.$queryRaw<AgreementRow[]>(Prisma.sql`
      SELECT a.id,a.assetId,a.renterId,ra.code AS assetCode,ra.name AS assetName,r.fullName AS renterName,a.startDate,a.endDate,a.monthlyRate,a.securityDeposit,a.billingDay,a.dueDay,a.status,a.notes,
        (SELECT COUNT(*) FROM RentalInvoice i WHERE i.tenantId=a.tenantId AND i.agreementId=a.id) AS invoiceCount
      FROM RentalAgreement a JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
      JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
      WHERE a.tenantId=${admin.tenantId} ORDER BY a.status='ACTIVE' DESC,a.startDate DESC
    `),
    prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
      SELECT i.id,i.invoiceNumber,i.chargeType,i.periodStart,i.periodEnd,i.dueDate,i.amount,i.amountPaid,i.balance,
        CASE WHEN i.status IN ('OPEN','PARTIAL') AND i.dueDate<CURDATE() AND i.balance>0 THEN 'OVERDUE' ELSE i.status END AS status,
        ra.code AS assetCode,ra.name AS assetName,r.fullName AS renterName,r.homeownerId AS renterHomeownerId
      FROM RentalInvoice i JOIN RentalAgreement a ON a.tenantId=i.tenantId AND a.id=i.agreementId
      JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
      WHERE i.tenantId=${admin.tenantId} ORDER BY i.dueDate DESC,i.createdAt DESC LIMIT 250
    `),
    prisma.$queryRaw<CollectionRow[]>(Prisma.sql`
      SELECT c.id,c.receiptNumber,c.description,c.payerType,c.payerName,c.homeownerId,u.name AS homeownerName,c.amount,c.refundable,c.amountRefunded,c.amountForfeited,
        COALESCE(SUM(a.amount),0) AS allocated,(c.amount-COALESCE(SUM(a.amount),0)) AS available
      FROM Collection c LEFT JOIN HomeownerProfile h ON h.tenantId=c.tenantId AND h.id=c.homeownerId
      LEFT JOIN User u ON u.id=h.userId LEFT JOIN RentalPaymentAllocation a ON a.tenantId=c.tenantId AND a.collectionId=c.id
      WHERE c.tenantId=${admin.tenantId} AND c.type='OTHER' AND c.payerType IN ('RENTER','HOMEOWNER')
      GROUP BY c.id,c.receiptNumber,c.description,c.payerType,c.payerName,c.homeownerId,u.name,c.amount,c.refundable,c.amountRefunded,c.amountForfeited
      HAVING available>0 ORDER BY c.collectionDate DESC LIMIT 5000
    `),
    prisma.homeownerProfile.findMany({ where: { tenantId: admin.tenantId, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } }, take: 5000 }),
  ]);

  const activeAgreements = agreements.filter((item) => item.status === "ACTIVE");
  const availableAssets = assets.filter((item) => item.status === "AVAILABLE");
  const activeRenters = renters.filter((item) => item.status === "ACTIVE");
  const openInvoices = invoices.filter((item) => !["PAID", "VOID"].includes(item.status));
  const outstanding = openInvoices.reduce((sum, item) => sum + Number(item.balance), 0);
  const overdueInvoices = openInvoices.filter((item) => item.status === "OVERDUE");
  const overdue = overdueInvoices.reduce((sum, item) => sum + Number(item.balance), 0);
  const advanceCreditBalance = collections.filter((item) => item.description === "Rental payment" && !item.refundable).reduce((sum, item) => sum + Number(item.available), 0);
  const homeownerOptions = homeowners.map((owner) => ({ id: owner.id, label: `${owner.user.name} · Block ${owner.block} Lot ${owner.lot}`, search: `${owner.user.name} ${owner.user.email} ${owner.accountNumber ?? ""} block ${owner.block} lot ${owner.lot} ${owner.phase ?? ""} ${owner.address}`.toLowerCase() }));
  const paymentRenterOptions = activeRenters.map((renter) => ({ id: renter.id, fullName: renter.fullName, homeownerLinked: Boolean(renter.homeownerId), currentAssetCode: renter.currentAssetCode }));

  return <>
    <PageHeader eyebrow="Finance · Rental operations" title="Rental Management" description="One workspace for rental assets, renters, agreements, billing, payments and reconciliation." />

    <section className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <StatCard label="Rental assets" value={String(assets.length)} note={`${availableAssets.length} available`} icon={Building2} />
      <StatCard label="Active renters" value={String(activeRenters.length)} note="Homeowner or external" icon={KeyRound} />
      <StatCard label="Active agreements" value={String(activeAgreements.length)} note={`${assets.length - availableAssets.length} occupied assets`} icon={Building2} />
      <StatCard label="Open rental bills" value={String(openInvoices.length)} note={money(outstanding)} icon={CircleDollarSign} />
      <StatCard label="Advance rental credit" value={money(advanceCreditBalance)} note="Unapplied rental payments" icon={CircleDollarSign} />
      <StatCard label="Overdue" value={money(overdue)} note={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}`} icon={FileWarning} />
    </section>

    <nav className="card mb-6 p-2" aria-label="Rental Management sections"><div className="flex gap-2 overflow-x-auto">
      {rentalViews.map((item) => <Link key={item.key} href={viewHref(item.key)} className={`min-w-fit rounded-xl px-4 py-3 text-sm font-black transition ${view === item.key ? "bg-pine-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{item.label}</Link>)}
    </div><p className="px-3 pb-1 pt-2 text-xs text-slate-500">{rentalViews.find((item) => item.key === view)?.description}</p></nav>

    {view === "payments" && openedFromCollections && <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><strong>Rental payment entry opened from Collections.</strong> Select the renter and record the payment here. HOAHub will create the official Collection receipt automatically and reconcile it to rental billing or advance credit.</div>}

    {view === "overview" && <>
      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        {[
          ["Step 1", "Record rental assets", "Maintain parking, stalls, rentable spaces and their default rates.", "assets"],
          ["Step 2", "Maintain renter records", "Identify each renter as a linked homeowner or an external renter.", "renters"],
          ["Step 3", "Assign asset & agreement", "Create fixed-term or open rental agreements with billing rules.", "agreements"],
          ["Step 4", "Generate rental billing", "Generate recurring rent invoices and automatically consume available advance credits.", "billing"],
          ["Step 5", "Record rental payments", "Issue the official receipt, auto-apply dues, or keep the amount as advance credit.", "payments"],
          ["Step 6", "Reconcile receipts", "Trace and reconcile rental cash without duplicating the central collection ledger.", "reconciliation"],
        ].map(([step, title, description, target]) => <Link key={step} href={viewHref(target as RentalView)} className="card block transition hover:-translate-y-0.5 hover:shadow-lg"><p className="eyebrow">{step}</p><h2 className="text-lg font-black">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p><p className="mt-4 text-sm font-black text-pine-700">Open {title} →</p></Link>)}
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="card"><div className="mb-3 flex items-end justify-between"><div><p className="eyebrow">Current occupancy</p><h2 className="text-lg font-black">Active agreements</h2></div><Link href={viewHref("agreements")} className="text-sm font-black text-pine-700">View all</Link></div><div className="space-y-3">{activeAgreements.slice(0, 6).map((agreement) => <div key={agreement.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3"><div><p className="font-black">{agreement.assetCode} · {agreement.assetName}</p><p className="text-sm text-slate-500">{agreement.renterName} · {agreement.endDate ? `until ${shortDate(agreement.endDate)}` : "Open contract"}</p></div><span className="font-black text-pine-700">{money(agreement.monthlyRate)}/mo</span></div>)}{!activeAgreements.length && <p className="py-6 text-center text-sm text-slate-500">No active rental agreements.</p>}</div></div>
        <div className="card"><div className="mb-3 flex items-end justify-between"><div><p className="eyebrow">Attention required</p><h2 className="text-lg font-black">Open rental receivables</h2></div><Link href={viewHref("billing")} className="text-sm font-black text-pine-700">View billing</Link></div><div className="space-y-3">{openInvoices.slice(0, 6).map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-3"><div><p className="font-black">{invoice.renterName} · {invoice.assetCode}</p><p className="text-sm text-slate-500">{invoice.invoiceNumber} · due {shortDate(invoice.dueDate)}</p></div><div className="text-right"><p className="font-black">{money(invoice.balance)}</p><StatusBadge status={invoice.status} /></div></div>)}{!openInvoices.length && <p className="py-6 text-center text-sm text-slate-500">No open rental invoices.</p>}</div></div>
      </section>
    </>}

    {view === "assets" && <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <form action={saveRentalAssetAction} className="card h-fit space-y-3"><div><p className="eyebrow">Asset master</p><h2 className="text-lg font-black">Add rental asset</h2><p className="text-sm text-slate-500">Record the tenant-owned inventory available for rent.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="label">Asset code<input className="field" name="code" placeholder="PARK-01" required /></label><label className="label">Type<select className="field" name="type" defaultValue="PARKING"><option value="PARKING">Parking</option><option value="STALL">Stall</option><option value="SPACE">Space</option><option value="OTHER">Other</option></select></label></div><label className="label">Asset name<input className="field" name="name" placeholder="Parking Slot P1-05" required /></label><label className="label">Location<input className="field" name="location" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="label">Default monthly rate<input className="field" name="defaultRate" type="number" min="0" step="0.01" defaultValue="0" required /></label><label className="label">Status<select className="field" name="status" defaultValue="AVAILABLE"><option value="AVAILABLE">Available</option><option value="INACTIVE">Inactive</option></select></label></div><label className="label">Notes<textarea className="field min-h-20" name="notes" /></label><SubmitButton className="btn-primary w-full">Save asset</SubmitButton></form>
      <div><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Inventory</p><h2 className="text-xl font-black">Rental assets</h2><p className="text-sm text-slate-500">One active agreement may occupy an asset at a time.</p></div><SearchInput placeholder="Search asset code, name, type or location" /></div><div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Asset</th><th>Type</th><th>Location</th><th>Default rate</th><th>Status</th><th>Actions</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id} data-search={`${asset.code} ${asset.name} ${asset.type} ${asset.location ?? ""} ${asset.status}`.toLowerCase()}><td><p className="font-bold">{asset.code}</p><p className="text-xs text-slate-400">{asset.name}</p></td><td>{label(asset.type)}</td><td>{asset.location || "-"}</td><td className="font-black">{money(asset.defaultRate)}</td><td><StatusBadge status={asset.status} /></td><td><RentalAssetActions asset={{ id: asset.id, code: asset.code, name: asset.name, type: asset.type, location: asset.location, defaultRate: Number(asset.defaultRate), status: asset.status, notes: asset.notes, canDelete: Number(asset.agreementCount) === 0 }} /></td></tr>)}{!assets.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No rental assets yet.</td></tr>}</tbody></table></StandardTable></div></div>
    </section>}

    {view === "renters" && <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <form action={saveRenterAction} className="card h-fit space-y-3"><div><p className="eyebrow">Renter master</p><h2 className="text-lg font-black">Add renter</h2><p className="text-sm text-slate-500">Link an existing homeowner when applicable; otherwise keep the renter external.</p></div><label className="label">Renter / business name<input className="field" name="fullName" required /></label><SearchableHomeownerSelect name="homeownerId" label="Homeowner link (optional)" homeowners={homeownerOptions} searchEndpoint="/api/admin/homeowners/search" placeholder="Search homeowner name, block, lot, account, or email" /><div className="grid gap-3 sm:grid-cols-2"><label className="label">Email<input className="field" type="email" name="email" /></label><label className="label">Phone<input className="field" name="phone" /></label></div><label className="label">Address<textarea className="field min-h-20" name="address" /></label><input type="hidden" name="status" value="ACTIVE" /><SubmitButton className="btn-primary w-full">Save renter</SubmitButton></form>
      <div><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Renter register</p><h2 className="text-xl font-black">Renters</h2></div><SearchInput placeholder="Search renter, homeowner, asset or status" /></div><div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Renter</th><th>Type</th><th>Current asset</th><th>Outstanding</th><th>Advance credit</th><th>Status</th><th>Actions</th></tr></thead><tbody>{renters.map((renter) => { const advance = collections.filter((collection) => collection.description === "Rental payment" && !collection.refundable && receiptMatchesRenterRecord(collection, renter)).reduce((sum, collection) => sum + Number(collection.available), 0); return <tr key={renter.id} data-search={`${renter.fullName} ${renter.homeownerName ?? "external"} ${renter.currentAssetCode ?? ""} ${renter.status}`.toLowerCase()}><td><p className="font-bold">{renter.fullName}</p><p className="text-xs text-slate-400">{renter.phone || renter.email || ""}</p></td><td><span className="font-bold">{renter.homeownerId ? "Homeowner" : "External"}</span>{renter.homeownerName && <p className="text-xs text-slate-400">{renter.homeownerName}</p>}</td><td>{renter.currentAssetCode ? <><p className="font-bold">{renter.currentAssetCode}</p><p className="text-xs text-slate-400">{renter.currentAssetName}</p></> : <span className="text-slate-400">No active assignment</span>}</td><td className="font-black">{money(renter.outstandingBalance)}</td><td className={advance > 0 ? "font-black text-pine-700" : "text-slate-400"}>{money(advance)}</td><td><StatusBadge status={renter.status} /></td><td><RenterRecordActions renter={{ id: renter.id, fullName: renter.fullName, email: renter.email, phone: renter.phone, address: renter.address, status: renter.status, homeownerId: renter.homeownerId, canDelete: Number(renter.agreementCount) === 0 }} homeowners={homeownerOptions} /></td></tr>; })}{!renters.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">No renters yet.</td></tr>}</tbody></table></StandardTable></div></div>
    </section>}

    {view === "agreements" && <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form action={saveRentalAgreementAction} className="card h-fit space-y-3"><div><p className="eyebrow">Agreement assignment</p><h2 className="text-lg font-black">Create rental agreement</h2><p className="text-sm text-slate-500">Assign one available asset to one active renter.</p></div><label className="label">Available asset<select className="field" name="assetId" required defaultValue=""><option value="" disabled>Select asset</option>{availableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.code} · {asset.name} · {money(asset.defaultRate)}/mo</option>)}</select></label><label className="label">Renter<select className="field" name="renterId" required defaultValue=""><option value="" disabled>Select renter</option>{activeRenters.map((renter) => <option key={renter.id} value={renter.id}>{renter.fullName} · {renter.homeownerId ? "Homeowner" : "External"}</option>)}</select></label><div className="rounded-xl border border-pine-100 bg-pine-50 p-3 text-xs text-pine-900"><strong>Contract term:</strong> enter an End date for a fixed-term contract. Leave End date blank for an <strong>Open Contract</strong>.</div><div className="grid gap-3 sm:grid-cols-2"><label className="label">Start date<input className="field" type="date" name="startDate" defaultValue={today} required /></label><label className="label">End date (optional)<input className="field" type="date" name="endDate" /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="label">Monthly rate<input className="field" type="number" min="0.01" step="0.01" name="monthlyRate" required /></label><label className="label">Security deposit<input className="field" type="number" min="0" step="0.01" name="securityDeposit" defaultValue="0" required /></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="label">Billing day<input className="field" type="number" min="1" max="28" name="billingDay" defaultValue="1" required /></label><label className="label">Due day<input className="field" type="number" min="1" max="28" name="dueDay" defaultValue="5" required /></label></div><label className="label">Notes<textarea className="field min-h-16" name="notes" /></label><SubmitButton className="btn-primary w-full">Activate agreement</SubmitButton></form>
      <div><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Occupancy</p><h2 className="text-xl font-black">Rental agreements</h2></div><SearchInput placeholder="Search asset, renter or agreement status" /></div><div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Asset</th><th>Renter</th><th>Contract</th><th>Rate</th><th>Deposit</th><th>Billing</th><th>Status</th><th>Actions</th></tr></thead><tbody>{agreements.map((agreement) => <tr key={agreement.id} data-search={`${agreement.assetCode} ${agreement.assetName} ${agreement.renterName} ${agreement.status} ${agreement.endDate ? "fixed" : "open contract"}`.toLowerCase()}><td><p className="font-bold">{agreement.assetCode}</p><p className="text-xs text-slate-400">{agreement.assetName}</p></td><td className="font-bold">{agreement.renterName}</td><td><p className="font-bold">{agreement.endDate ? "Fixed term" : "Open contract"}</p><p className="text-xs text-slate-400">{shortDate(agreement.startDate)}{agreement.endDate ? ` – ${shortDate(agreement.endDate)}` : " – ongoing"}</p></td><td className="font-black">{money(agreement.monthlyRate)}</td><td>{money(agreement.securityDeposit)}</td><td>Day {agreement.billingDay}<p className="text-xs text-slate-400">Due day {agreement.dueDay}</p></td><td><StatusBadge status={agreement.status} /></td><td><RentalAgreementActions agreement={{ id: agreement.id, startDate: agreement.startDate, endDate: agreement.endDate, monthlyRate: Number(agreement.monthlyRate), billingDay: agreement.billingDay, dueDay: agreement.dueDay, status: agreement.status, notes: agreement.notes, canDelete: Number(agreement.invoiceCount) === 0 }} today={today} /></td></tr>)}{!agreements.length && <tr><td colSpan={8} className="py-10 text-center text-slate-500">No rental agreements have been created.</td></tr>}</tbody></table></StandardTable></div></div>
    </section>}

    {view === "billing" && <>
      <section className="card mb-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="eyebrow">Recurring receivables</p><h2 className="text-lg font-black">Generate monthly rent</h2><p className="max-w-3xl text-sm text-slate-500">Creates one idempotent rent invoice per active agreement and month, then automatically applies any available advance rental credit oldest-due-first.</p></div><form action={generateRentalInvoicesAndReconcileAction} className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="label">Billing month<input className="field min-w-44" type="month" name="billingMonth" defaultValue={monthInput()} required /></label><SubmitButton className="btn-primary">Generate & reconcile</SubmitButton></form></div></section>
      <section><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Rental receivables</p><h2 className="text-xl font-black">Rental billing register</h2><p className="text-sm text-slate-500">Recurring rent and security-deposit invoices. Advance rent credit is applied only to RENT charges.</p></div><SearchInput placeholder="Search renter, asset, invoice or status" /></div><div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Invoice</th><th>Renter / asset</th><th>Period / due</th><th>Charge</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} data-search={`${invoice.invoiceNumber} ${invoice.renterName} ${invoice.assetCode} ${invoice.chargeType} ${invoice.status}`.toLowerCase()}><td className="font-bold">{invoice.invoiceNumber}</td><td><p className="font-bold">{invoice.renterName}</p><p className="text-xs text-slate-400">{invoice.assetCode} · {invoice.assetName}</p></td><td><p>{shortDate(invoice.periodStart)}{invoice.periodEnd.getTime() !== invoice.periodStart.getTime() ? ` – ${shortDate(invoice.periodEnd)}` : ""}</p><p className="text-xs text-slate-400">Due {shortDate(invoice.dueDate)}</p></td><td>{label(invoice.chargeType)}{invoice.chargeType === "SECURITY_DEPOSIT" && <p className="text-xs font-bold text-amber-700">Liability, not income</p>}</td><td className="font-black">{money(invoice.amount)}</td><td>{money(invoice.amountPaid)}</td><td className="font-black">{money(invoice.balance)}</td><td><StatusBadge status={invoice.status} /></td></tr>)}{!invoices.length && <tr><td colSpan={8} className="py-12 text-center text-slate-500">No rental invoices yet.</td></tr>}</tbody></table></StandardTable></div></section>
    </>}

    {view === "payments" && <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
      <RentalPaymentForm renters={paymentRenterOptions} today={today} />
      <div><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Rental cash & credit</p><h2 className="text-xl font-black">Unapplied rental receipt balances</h2><p className="text-sm text-slate-500">Direct rental payments remain here as advance credit until allocated. Security deposits stay separately classified as refundable liabilities.</p></div><div className="flex gap-2"><Link href="/admin/collections" className="btn-secondary">View Collection Ledger</Link><SearchInput placeholder="Search receipt, payer or amount" /></div></div><div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Receipt</th><th>Payer</th><th>Classification</th><th>Received</th><th>Allocated</th><th>Available</th></tr></thead><tbody>{collections.map((collection) => { const payer = collection.payerName || collection.homeownerName || "Unknown payer"; const classification = collection.refundable ? "Refundable deposit liability" : collection.description === "Rental payment" ? "Advance rental credit" : "Income / rental receipt"; return <tr key={collection.id} data-search={`${collection.receiptNumber} ${payer} ${collection.payerType} ${classification} ${Number(collection.available).toFixed(2)}`.toLowerCase()}><td className="font-bold">{collection.receiptNumber}</td><td><p className="font-bold">{payer}</p><p className="text-xs text-slate-400">{label(collection.payerType)}</p></td><td className={collection.description === "Rental payment" && !collection.refundable ? "font-bold text-pine-700" : "font-bold"}>{classification}</td><td className="font-black">{money(collection.amount)}</td><td>{money(collection.allocated)}</td><td className="font-black text-pine-700">{money(collection.available)}</td></tr>; })}{!collections.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No available renter or homeowner receipts.</td></tr>}</tbody></table></StandardTable></div></div>
    </section>}

    {view === "reconciliation" && <section className="space-y-5">
      <RentalReconcileControl />
      <div><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">Receipt → allocation → invoice</p><h2 className="text-xl font-black">Invoices & payment reconciliation</h2><p className="text-sm text-slate-500">Automatic reconciliation uses oldest-due-first. Manual allocation remains available for exceptions and security deposits.</p></div><SearchInput placeholder="Search renter, asset, invoice or status" /></div><div className="table-wrap"><StandardTable><table className="data-table"><thead><tr><th>Invoice</th><th>Renter / asset</th><th>Due</th><th>Charge</th><th>Balance</th><th>Status</th><th>Reconciliation</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} data-search={`${invoice.invoiceNumber} ${invoice.renterName} ${invoice.assetCode} ${invoice.chargeType} ${invoice.status}`.toLowerCase()}><td className="font-bold">{invoice.invoiceNumber}</td><td><p className="font-bold">{invoice.renterName}</p><p className="text-xs text-slate-400">{invoice.assetCode} · {invoice.assetName}</p></td><td>{shortDate(invoice.dueDate)}</td><td>{label(invoice.chargeType)}</td><td className="font-black">{money(invoice.balance)}</td><td><StatusBadge status={invoice.status} /></td><td>{!["PAID","VOID"].includes(invoice.status) ? <form action={allocateRentalPaymentAction} className="min-w-72 space-y-2"><input type="hidden" name="invoiceId" value={invoice.id} /><SearchableSelect name="collectionId" label="Apply existing receipt" items={collections.filter((collection) => receiptCanSettleInvoice(collection, invoice)).map((collection) => { const payer = collection.payerName || collection.homeownerName || invoice.renterName; const classification = collection.refundable ? "deposit liability" : collection.description === "Rental payment" ? "advance rental credit" : invoice.chargeType === "SECURITY_DEPOSIT" ? "will reclassify to deposit" : "income receipt"; return { id: collection.id, label: `${collection.receiptNumber} · ${payer} · ${money(collection.available)} available · ${classification}`, search: `${collection.receiptNumber} ${payer} ${Number(collection.available).toFixed(2)} ${classification}`.toLowerCase() }; })} placeholder="Search receipt number, renter or amount" required />{invoice.chargeType === "SECURITY_DEPOSIT" && <p className="text-[11px] text-slate-500">A full unused income receipt can be reclassified to a refundable rental security-deposit liability.</p>}<div className="flex gap-2"><input className="field min-w-28" type="number" min="0.01" max={Number(invoice.balance)} step="0.01" name="amount" defaultValue={Number(invoice.balance).toFixed(2)} required /><SubmitButton className="btn-secondary whitespace-nowrap">Allocate</SubmitButton></div></form> : <span className="text-xs font-bold text-emerald-700">Matched · reconciled</span>}</td></tr>)}{!invoices.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No rental invoices to reconcile.</td></tr>}</tbody></table></StandardTable></div></div>
    </section>}
  </>;
}
