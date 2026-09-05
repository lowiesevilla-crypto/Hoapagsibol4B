import { Building2, CalendarDays, MapPin, ShieldCheck } from "lucide-react";
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

function assetTypeLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function PortalRentalReservationsPage() {
  const profile = await requireHomeownerProfile();
  const assets = await prisma.$queryRaw<RentalAssetReservationRow[]>(Prisma.sql`
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
  `);

  const openCount = assets.filter((asset) => !asset.reservationId).length;
  const mineCount = assets.filter((asset) => asset.reservationHomeownerId === profile.id).length;

  return (
    <PortalPageContainer className="space-y-5">
      <PageHeader
        eyebrow="Resident services · Rentals"
        title="Rental reservations"
        description="Browse HOA rental assets that are currently available and place a protected homeowner reservation online."
      />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Rental reservation summary">
        <PortalSummaryCard label="Available now" value={String(openCount)} note="Ready for reservation" icon={Building2} />
        <PortalSummaryCard label="My active holds" value={String(mineCount)} note="Reserved by this account" icon={ShieldCheck} />
        <PortalSummaryCard label="Listed assets" value={String(assets.length)} note="Tenant AVAILABLE inventory" icon={CalendarDays} />
      </section>

      <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
        <p className="font-black">How reservations work</p>
        <p>A reservation protects an available asset from another homeowner reservation. The HOA office still finalizes the rental agreement, billing terms, deposit, and move-in or turnover requirements. Other homeowners can see that an asset is reserved, but they cannot see who reserved it.</p>
      </section>

      <section className="space-y-3">
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
            <Building2 className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
            <h2 className="mt-3 font-black text-slate-900">No available rental assets</h2>
            <p className="mt-1 text-sm text-slate-500">The HOA has no rental inventory marked Available right now.</p>
          </div>
        )}
      </section>
    </PortalPageContainer>
  );
}