import Link from "next/link";
import { SearchableHomeownerSelect, type SearchableHomeownerOption } from "@/components/searchable-homeowner-select";
import { DeleteButton, SubmitButton } from "@/components/ui";
import {
  deleteRentalAssetAction,
  deleteRenterAction,
  updateRentalAssetAction,
  updateRenterAction,
} from "@/lib/actions/rental-maintenance";
import { getAdminRentalAssetReservationSummary } from "@/lib/services/rental-reservations";
import { shortDate } from "@/lib/utils";

type AssetActionRecord = {
  id: string;
  code: string;
  name: string;
  type: string;
  location: string | null;
  defaultRate: number;
  status: string;
  notes: string | null;
  canDelete: boolean;
};

type RenterActionRecord = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  homeownerId: string | null;
  canDelete: boolean;
};

type AgreementActionRecord = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  monthlyRate: number;
  billingDay: number;
  dueDay: number;
  status: string;
  notes: string | null;
  canDelete: boolean;
};

export async function RentalAssetActions({ asset }: { asset: AssetActionRecord }) {
  const reservation = await getAdminRentalAssetReservationSummary(asset.id);
  const hasActiveReservation = Boolean(reservation.reservationId);
  const canDelete = asset.canDelete && reservation.historyCount === 0;

  return <div className="flex min-w-48 flex-col gap-2">
    {hasActiveReservation ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-950">
        <p className="font-black uppercase tracking-wide">Reserved · {reservation.status}</p>
        <p className="font-bold">{reservation.homeownerName || "Homeowner"}</p>
        {(reservation.block || reservation.lot) && <p>Block {reservation.block || "-"} · Lot {reservation.lot || "-"}</p>}
        {reservation.reservedAt && <p>Reserved {shortDate(reservation.reservedAt)}</p>}
      </div>
    ) : (
      <span className="text-[11px] font-semibold text-slate-400">No active reservation</span>
    )}
    <details>
      <summary className="cursor-pointer text-xs font-bold text-sky-700">Edit</summary>
      <form action={updateRentalAssetAction} className="mt-2 min-w-72 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <input type="hidden" name="assetId" value={asset.id} />
        <div className="grid grid-cols-2 gap-2"><label className="label">Code<input className="field" name="code" defaultValue={asset.code} required /></label><label className="label">Type<select className="field" name="type" defaultValue={asset.type}><option value="STALL">Stall</option><option value="PARKING">Parking</option><option value="SPACE">Space</option><option value="OTHER">Other</option></select></label></div>
        <label className="label">Name<input className="field" name="name" defaultValue={asset.name} required /></label>
        <label className="label">Location<input className="field" name="location" defaultValue={asset.location ?? ""} /></label>
        <label className="label">Default monthly rate<input className="field" name="defaultRate" type="number" min="0" step="0.01" defaultValue={asset.defaultRate.toFixed(2)} required /></label>
        {asset.status === "OCCUPIED" ? <><input type="hidden" name="status" value="OCCUPIED" /><p className="text-xs font-semibold text-slate-500">Status is locked to Occupied while an agreement is active.</p></> : hasActiveReservation ? <><input type="hidden" name="status" value={asset.status} /><p className="text-xs font-semibold text-amber-700">Status is locked while a homeowner reservation is active.</p></> : <label className="label">Status<select className="field" name="status" defaultValue={asset.status}><option value="AVAILABLE">Available</option><option value="INACTIVE">Inactive</option></select></label>}
        <label className="label">Notes<textarea className="field min-h-16" name="notes" defaultValue={asset.notes ?? ""} /></label>
        <SubmitButton className="btn-primary w-full">Save changes</SubmitButton>
      </form>
    </details>
    {canDelete ? <form action={deleteRentalAssetAction}><input type="hidden" name="assetId" value={asset.id} /><DeleteButton /></form> : <span className="text-[11px] font-semibold text-slate-400">History protected</span>}
  </div>;
}

export function RenterRecordActions({ renter, homeowners }: { renter: RenterActionRecord; homeowners: SearchableHomeownerOption[] }) {
  return <div className="flex min-w-28 flex-col gap-2">
    <details>
      <summary className="cursor-pointer text-xs font-bold text-sky-700">Edit</summary>
      <form action={updateRenterAction} className="mt-2 min-w-80 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <input type="hidden" name="renterId" value={renter.id} />
        <label className="label">Renter name<input className="field" name="fullName" defaultValue={renter.fullName} required /></label>
        <SearchableHomeownerSelect name="homeownerId" label="Existing homeowner link (optional)" homeowners={homeowners} defaultValue={renter.homeownerId ?? ""} searchEndpoint="/api/admin/homeowners/search" placeholder="Search homeowner name, block, lot, account, or email" />
        <div className="grid grid-cols-2 gap-2"><label className="label">Email<input className="field" type="email" name="email" defaultValue={renter.email ?? ""} /></label><label className="label">Phone<input className="field" name="phone" defaultValue={renter.phone ?? ""} /></label></div>
        <label className="label">Address<textarea className="field min-h-16" name="address" defaultValue={renter.address ?? ""} /></label>
        <label className="label">Status<select className="field" name="status" defaultValue={renter.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        <SubmitButton className="btn-primary w-full">Save changes</SubmitButton>
      </form>
    </details>
    {renter.canDelete ? <form action={deleteRenterAction}><input type="hidden" name="renterId" value={renter.id} /><DeleteButton /></form> : <span className="text-[11px] font-semibold text-slate-400">History protected</span>}
  </div>;
}

export function RentalAgreementActions({ agreement }: { agreement: AgreementActionRecord; today: string }) {
  return <div className="flex min-w-32 flex-col gap-2">
    <Link className="btn-secondary min-h-8 px-3 py-1 text-xs" href={`/admin/rentals/agreements/${agreement.id}`}>View / Edit</Link>
    <span className="text-[11px] font-semibold text-slate-400">Agreement controls open in a focused view.</span>
  </div>;
}