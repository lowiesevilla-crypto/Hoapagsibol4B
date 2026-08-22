import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SubmitButton } from "@/components/ui";
import { deleteRentalAgreementAction, updateRentalAgreementAction } from "@/lib/actions/rental-maintenance";
import { endRentalAgreementAction } from "@/lib/actions/rentals";
import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { prisma } from "@/lib/db";
import { inputDate, money, shortDate } from "@/lib/utils";

type AgreementDetail = {
  id: string;
  assetCode: string;
  assetName: string;
  assetType: string;
  assetLocation: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  homeownerId: string | null;
  homeownerName: string | null;
  startDate: Date;
  endDate: Date | null;
  monthlyRate: Prisma.Decimal | number | string;
  securityDeposit: Prisma.Decimal | number | string;
  billingDay: number;
  dueDay: number;
  status: string;
  notes: string | null;
  invoiceCount: bigint | number;
  openInvoiceCount: bigint | number;
  outstandingBalance: Prisma.Decimal | number | string;
};

export default async function RentalAgreementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string }> }) {
  const admin = await requirePermission(Permission.BILLING_MANAGE);
  const { id } = await params;
  const query = await searchParams;
  const rows = await prisma.$queryRaw<AgreementDetail[]>(Prisma.sql`
    SELECT a.id,ra.code AS assetCode,ra.name AS assetName,ra.type AS assetType,ra.location AS assetLocation,
      r.fullName AS renterName,r.email AS renterEmail,r.phone AS renterPhone,r.homeownerId,u.name AS homeownerName,
      a.startDate,a.endDate,a.monthlyRate,a.securityDeposit,a.billingDay,a.dueDay,a.status,a.notes,
      (SELECT COUNT(*) FROM RentalInvoice i WHERE i.tenantId=a.tenantId AND i.agreementId=a.id) AS invoiceCount,
      (SELECT COUNT(*) FROM RentalInvoice i WHERE i.tenantId=a.tenantId AND i.agreementId=a.id AND i.status NOT IN ('PAID','VOID')) AS openInvoiceCount,
      (SELECT COALESCE(SUM(i.balance),0) FROM RentalInvoice i WHERE i.tenantId=a.tenantId AND i.agreementId=a.id AND i.status<>'VOID') AS outstandingBalance
    FROM RentalAgreement a
    JOIN RentalAsset ra ON ra.tenantId=a.tenantId AND ra.id=a.assetId
    JOIN Renter r ON r.tenantId=a.tenantId AND r.id=a.renterId
    LEFT JOIN HomeownerProfile h ON h.tenantId=r.tenantId AND h.id=r.homeownerId
    LEFT JOIN User u ON u.id=h.userId
    WHERE a.tenantId=${admin.tenantId} AND a.id=${id}
    LIMIT 1
  `);
  const agreement = rows[0];
  if (!agreement) notFound();
  const canDelete = Number(agreement.invoiceCount) === 0;
  const today = inputDate(new Date());

  return <>
    <PageHeader eyebrow="Rental Management · Agreement" title={`${agreement.assetCode} · ${agreement.renterName}`} description="Review and maintain the rental agreement in a focused view. Existing invoices and payment history are never rewritten by future-term changes." action={<Link className="btn-secondary" href="/admin/rentals?view=agreements">← Back to agreements</Link>} />

    {query.success && <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Agreement changes saved successfully.</div>}

    <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Info label="Asset" value={`${agreement.assetCode} · ${agreement.assetName}`} note={[agreement.assetType.replaceAll("_", " "), agreement.assetLocation].filter(Boolean).join(" · ")} />
      <Info label="Renter" value={agreement.renterName} note={agreement.homeownerName ? `Homeowner · ${agreement.homeownerName}` : agreement.renterEmail || agreement.renterPhone || "External renter"} />
      <Info label="Contract" value={agreement.endDate ? "Fixed term" : "Open contract"} note={`${shortDate(agreement.startDate)}${agreement.endDate ? ` – ${shortDate(agreement.endDate)}` : " – ongoing"}`} />
      <div className="card"><p className="eyebrow">Status</p><div className="mt-2"><StatusBadge status={agreement.status} /></div><p className="mt-3 text-sm text-slate-500">{Number(agreement.openInvoiceCount)} open invoice(s) · {money(agreement.outstandingBalance)} outstanding</p></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <form action={updateRentalAgreementAction} className="card space-y-5">
        <input type="hidden" name="agreementId" value={agreement.id} />
        <input type="hidden" name="returnToAgreement" value="1" />
        <div><p className="eyebrow">Agreement terms</p><h2 className="text-xl font-black">Edit agreement</h2><p className="mt-1 text-sm text-slate-500">Changes affect the agreement and future billing only. Existing invoices, receipts and deposit accounting remain intact.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">Monthly rate<input className="field" type="number" min="0.01" step="0.01" name="monthlyRate" defaultValue={Number(agreement.monthlyRate).toFixed(2)} required /></label>
          <label className="label">End date (optional)<input className="field" type="date" name="endDate" min={inputDate(agreement.startDate)} defaultValue={agreement.endDate ? inputDate(agreement.endDate) : ""} /></label>
          <label className="label">Billing day<input className="field" type="number" min="1" max="28" name="billingDay" defaultValue={agreement.billingDay} required /><span className="mt-1 block text-xs font-semibold text-slate-500">Automatic rent billing uses this day each month.</span></label>
          <label className="label">Due day<input className="field" type="number" min="1" max="28" name="dueDay" defaultValue={agreement.dueDay} required /></label>
        </div>
        <label className="label">Notes<textarea className="field min-h-28" name="notes" defaultValue={agreement.notes ?? ""} /></label>
        <SubmitButton className="btn-primary">Save agreement changes</SubmitButton>
      </form>

      <aside className="space-y-5">
        <div className="card"><p className="eyebrow">Financial terms</p><dl className="mt-3 space-y-3 text-sm"><Row label="Monthly rent" value={money(agreement.monthlyRate)} /><Row label="Security deposit" value={money(agreement.securityDeposit)} /><Row label="Billing day" value={`Day ${agreement.billingDay}`} /><Row label="Due day" value={`Day ${agreement.dueDay}`} /></dl></div>
        {agreement.status === "ACTIVE" && <form action={endRentalAgreementAction} className="card space-y-3"><input type="hidden" name="agreementId" value={agreement.id} /><input type="hidden" name="returnToAgreement" value="1" /><div><p className="eyebrow">Close occupancy</p><h2 className="font-black">End agreement</h2><p className="text-sm text-slate-500">Ending releases the asset back to Available while preserving all financial history.</p></div><label className="label">End date<input className="field" type="date" name="endDate" min={inputDate(agreement.startDate)} defaultValue={today} required /></label><SubmitButton className="btn-secondary w-full">End agreement</SubmitButton></form>}
        <div className="card"><p className="eyebrow">Record protection</p>{canDelete ? <form action={deleteRentalAgreementAction} className="mt-3"><input type="hidden" name="agreementId" value={agreement.id} /><DeleteButton label="Delete agreement" /></form> : <p className="mt-2 text-sm font-semibold text-slate-500">This agreement has invoice/deposit history and cannot be deleted. End it instead to preserve the audit trail.</p>}</div>
      </aside>
    </section>
  </>;
}

function Info({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="card"><p className="eyebrow">{label}</p><p className="mt-2 font-black text-slate-900">{value}</p>{note && <p className="mt-1 text-sm text-slate-500">{note}</p>}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0"><dt className="text-slate-500">{label}</dt><dd className="font-black">{value}</dd></div>;
}
