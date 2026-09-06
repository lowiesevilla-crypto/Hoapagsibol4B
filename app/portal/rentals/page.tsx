import Link from "next/link";
import { Building2, CalendarDays, FileText, MapPin, Printer, ShieldCheck } from "lucide-react";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PortalPageContainer, PortalSectionHeader, PortalSummaryCard } from "@/components/portal-mobile-shell";
import { SubmitButton } from "@/components/ui";
import { cancelRentalAssetReservationAction, reserveRentalAssetAction } from "@/lib/actions/rental-reservations";
import { prisma } from "@/lib/db";
import { requireHomeownerProfile } from "@/lib/portal";
import { money, shortDate } from "@/lib/utils";

type RentalAssetReservationRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  location: string | null;
  defaultRate: Prisma.Decimal | number | string;
  notes: string | null;
  reservationId: string | null;
  reservationHomeownerId: string | null;
  reservedAt: Date | null;
};

type HomeownerRentalAgreementRow = {
  id: string;
  assetCode: string;
  assetName: string;
  assetType: string;
  assetLocation: string | null;
  startDate: Date;
  endDate: Date | null;
  monthlyRate: Prisma.Decimal | number | string;
  securityDeposit: Prisma.Decimal | number | string;
  billingDay: number;
  dueDay: number;
  status: string;
  contractNumber: string | null;
  signedUploadedAt: Date | null;
};

function assetTypeLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function PortalRentalReservationsPage() {
  const profile = await requireHomeownerProfile();
  const [assets, agreements] = await Promise.all([
    prisma.$queryRaw<RentalAssetReservationRow[]>(Prisma.sql`
      SELECT
        ra.id,
        ra.code,
        ra.name,
        ra.type,
        ra.location,
        ra.defaultRate,
        ra.notes,
        reservation.id AS reservationId,
        reservation.homeownerId AS reservationHomeownerId,
        reservation.reservedAt
      FROM RentalAsset ra
      LEFT JOIN RentalAssetReservation reservation
        ON reservation.tenantId=ra.tenantId
        AND reservation.assetId=ra.id
        AND reservation.status='ACTIVE'
      WHERE ra.tenantId=${profile.tenantId} AND ra.status='AVAILABLE'
      ORDER BY reservation.id IS NULL DESC, ra.type ASC, ra.code ASC
      LIMIT 250
    `),
    prisma.$queryRaw<HomeownerRentalAgreementRow[]>(Prisma.sql`
      SELECT
        a.id,
        ra.code AS assetCode,
        ra.name AS assetName,
        ra.type AS assetType,
        ra.location AS assetLocation,
        a.startDate,
        a.endDate,
        a.monthlyRate,
        a.securityDeposit,
        a.billingDay,
        a.dueDay,
        a.status,
        document.contractNumber,
        document.signedUploadedAt
      FROM RentalAgreement a
      JOIN Renter renter
        ON renter.tenantId=a.tenantId
        AND renter.id=a.renterId
      JOIN RentalAsset ra
        ON ra.tenantId=a.tenantId
        AND ra.id=a.assetId
      LEFT JOIN RentalAgreementDocument document
        ON document.tenantId=a.tenantId
        AND document.agreementId=a.id
        AND document.version=1
      WHERE a.tenantId=${profile.tenantId}
        AND renter.homeownerId=${profile.id}
      ORDER BY a.status='ACTIVE' DESC, a.startDate DESC, a.createdAt DESC
      LIMIT 100
    `),
  ]);

  const openCount = assets.filter((asset) => !asset.reservationId).length;
  const mineCount = assets.filter((asset) => asset.reservationHomeownerId === profile.id).length;
  const activeAgreementCount = agreements.filter((agreement) => agreement.status === "ACTIVE").length;

  return (
    <PortalPageContainer className="space-y-6">
      <PageHeader
        eyebrow="Resident services · Rentals"
        title="My rentals & reservations"
        description="Reserve available HOA rental assets, review active rental agreements, and download your official contract copies."
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Rental summary">
        <PortalSummaryCard label="My active rentals" value={String(activeAgreementCount)} note="Association-approved agreements" icon={FileText} />
        <PortalSummaryCard label="My reservation holds" value={String(mineCount)} note="Awaiting HOA agreement activation" icon={ShieldCheck} />
        <PortalSummaryCard label="Available now" value={String(openCount)} note="Ready for reservation" icon={Building2} />
      </section>

      <section className="space-y-3" aria-label="My rental agreements">
        <PortalSectionHeader eyebrow="Official records" title="My rental agreements" />
        {agreements.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {agreements.map((agreement) => (
              <article key={agreement.id} className="card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{assetTypeLabel(agreement.assetType)} · {agreement.assetCode}</p>
                    <h2 className="text-lg font-black text-slate-950">{agreement.assetName}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {shortDate(agreement.startDate)} – {agreement.endDate ? shortDate(agreement.endDate) : "Ongoing"}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${agreement.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                    {agreement.status}
                  </span>
                </div>

                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Monthly rent</dt><dd className="mt-1 font-black text-slate-900">{money(Number(agreement.monthlyRate))}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Security deposit</dt><dd className="mt-1 font-black text-slate-900">{money(Number(agreement.securityDeposit))}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Billing schedule</dt><dd className="mt-1 font-black text-slate-900">Bill day {agreement.billingDay} · Due day {agreement.dueDay}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Contract</dt><dd className="mt-1 font-black text-slate-900">{agreement.contractNumber || "Official HOAHub contract"}</dd></div>
                </dl>

                {agreement.assetLocation && <p className="flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{agreement.assetLocation}</p>}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Link className="btn-primary min-h-11 text-center text-xs" href={`/api/rentals/agreements/${agreement.id}/contract?format=pdf`}>PDF</Link>
                  <Link className="btn-secondary min-h-11 text-center text-xs" href={`/api/rentals/agreements/${agreement.id}/contract?format=docx`}>Word</Link>
                  <Link className="btn-secondary min-h-11 text-center text-xs" href={`/api/rentals/agreements/${agreement.id}/contract?format=print`} target="_blank" rel="noreferrer"><Printer className="mr-1 inline h-4 w-4" />Print</Link>
                  {agreement.signedUploadedAt ? (
                    <Link className="btn-secondary min-h-11 text-center text-xs" href={`/api/rentals/agreements/${agreement.id}/signed`}>Signed copy</Link>
                  ) : (
                    <span className="flex min-h-11 items-center justify-center rounded-xl border border-dashed border-slate-200 px-3 text-center text-[11px] font-bold text-slate-400">Signed copy pending</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="card py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <h2 className="mt-3 font-black text-slate-900">No rental agreement yet</h2>
            <p className="mt-1 text-sm text-slate-500">Once the HOA activates an agreement linked to your homeowner account, the contract will appear here automatically.</p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
        <p className="font-black">How reservations work</p>
        <p>A reservation protects an available asset from another homeowner reservation. The HOA office finalizes the renter, contract term, billing, deposit, and turnover requirements. When the HOA activates the agreement, the reservation is converted to fulfilled history and your official contract becomes available in this screen.</p>
      </section>

      <section className="space-y-3" aria-label="Available rental assets">
        <PortalSectionHeader eyebrow="Available rental inventory" title="Choose an asset" />
        {assets.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assets.map((asset) => {
              const reservedByMe = asset.reservationHomeownerId === profile.id;
              const reservedByAnother = Boolean(asset.reservationId && !reservedByMe);
              return (
                <article key={asset.id} className="card flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="eyebrow">{assetTypeLabel(asset.type)} · {asset.code}</p>
                      <h2 className="text-lg font-black text-slate-950">{asset.name}</h2>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${reservedByMe ? "bg-emerald-100 text-emerald-800" : reservedByAnother ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>
                      {reservedByMe ? "Reserved by you" : reservedByAnother ? "Reserved" : "Available"}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-slate-600">
                    <p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{asset.location || "Location to be confirmed by the HOA"}</p>
                    <p><span className="font-black text-slate-900">Default monthly rate:</span> {money(Number(asset.defaultRate))}</p>
                    {asset.notes && <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{asset.notes}</p>}
                    {reservedByMe && asset.reservedAt && <p className="text-xs font-semibold text-emerald-700">Your reservation has been active since {shortDate(asset.reservedAt)}.</p>}
                    {reservedByAnother && <p className="text-xs font-semibold text-amber-700">This asset already has an active homeowner reservation.</p>}
                  </div>

                  <div className="mt-auto pt-1">
                    {!asset.reservationId && (
                      <form action={reserveRentalAssetAction}>
                        <input type="hidden" name="assetId" value={asset.id} />
                        <SubmitButton className="btn-primary w-full">Reserve this asset</SubmitButton>
                      </form>
                    )}
                    {reservedByMe && asset.reservationId && (
                      <form action={cancelRentalAssetReservationAction}>
                        <input type="hidden" name="reservationId" value={asset.reservationId} />
                        <SubmitButton className="btn-secondary w-full">Cancel my reservation</SubmitButton>
                      </form>
                    )}
                    {reservedByAnother && <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">Not currently reservable</p>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="card py-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <h2 className="mt-3 font-black text-slate-900">No available rental assets</h2>
            <p className="mt-1 text-sm text-slate-500">The HOA has no rental inventory marked Available right now.</p>
          </div>
        )}
      </section>
    </PortalPageContainer>
  );
}
