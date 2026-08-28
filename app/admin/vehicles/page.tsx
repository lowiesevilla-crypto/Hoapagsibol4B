import Link from "next/link";
import { CarFront, CircleDollarSign, Search, Sticker } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { DeleteButton, SearchInput } from "@/components/ui";
import { VehicleForm } from "@/components/vehicle-form";
import { deleteVehicleAction } from "@/lib/actions/vehicles";
import { prisma } from "@/lib/db";
import { shortDate } from "@/lib/utils";

export default async function VehiclesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const [homeowners, stickerCollections, vehicles, selected] = await Promise.all([
    prisma.homeownerProfile.findMany({ where: { status: "ACTIVE" }, include: { user: true }, orderBy: { user: { name: "asc" } } }),
    prisma.collection.findMany({ where: { type: "STICKER", payerType: "HOMEOWNER" }, include: { homeowner: { include: { user: true } } }, orderBy: { collectionDate: "desc" } }),
    prisma.vehicle.findMany({ include: { homeowner: { include: { user: true } }, stickerCollection: true }, orderBy: [{ status: "asc" }, { homeowner: { user: { name: "asc" } } }] }),
    edit ? prisma.vehicle.findUnique({ where: { id: edit } }) : null,
  ]);

  const linkedPayments = vehicles.filter((vehicle) => vehicle.stickerCollection).length;
  const activeVehicles = vehicles.filter((vehicle) => vehicle.status === "ACTIVE").length;

  return <>
    <PageHeader eyebrow="Community security" title="Vehicle and sticker monitoring" description="Register homeowner vehicles, track HOA stickers, payment links, and expiry status." />

    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><CarFront className="size-4 text-pine-600" />Registered vehicles</div>
        <p className="mt-2 text-2xl font-black text-slate-900">{vehicles.length}</p>
        <p className="mt-1 text-xs text-slate-500">All homeowner vehicle records in this tenant.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Sticker className="size-4 text-leaf-600" />Active records</div>
        <p className="mt-2 text-2xl font-black text-slate-900">{activeVehicles}</p>
        <p className="mt-1 text-xs text-slate-500">Current records based on the existing vehicle status.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><CircleDollarSign className="size-4 text-pine-600" />Payment-linked stickers</div>
        <p className="mt-2 text-2xl font-black text-slate-900">{linkedPayments}</p>
        <p className="mt-1 text-xs text-slate-500">Sticker records already linked to an existing collection.</p>
      </div>
    </div>

    <VehicleForm homeowners={homeowners} stickerCollections={stickerCollections} vehicle={selected ?? undefined} />

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="vehicle-directory-heading">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-pine-700">Security registry</p>
          <h2 id="vehicle-directory-heading" className="mt-1 text-lg font-black text-slate-900">Vehicle directory</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Search by homeowner, block/lot, plate, sticker, make, model, or color. Existing vehicle and sticker rules remain unchanged.</p>
        </div>
        <div className="w-full lg:max-w-md">
          <p className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Search className="size-3.5" />Search vehicles</p>
          <SearchInput placeholder="Owner, plate, sticker, make or model" />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Homeowner</th><th>Vehicle</th><th>Plate</th><th>Sticker</th><th>Validity</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {vehicles.map((vehicle) => <tr key={vehicle.id} data-search={`${vehicle.homeowner.user.name} ${vehicle.homeowner.block} ${vehicle.homeowner.lot} ${vehicle.plateNumber} ${vehicle.stickerNumber} ${vehicle.make} ${vehicle.model} ${vehicle.color}`.toLowerCase()}>
              <td><p className="font-bold text-slate-900">{vehicle.homeowner.user.name}</p><p className="text-xs text-slate-400">Block {vehicle.homeowner.block} · Lot {vehicle.homeowner.lot}</p></td>
              <td><p className="flex items-center gap-2 font-semibold"><CarFront className="size-4 text-pine-600" />{vehicle.make} {vehicle.model}</p><p className="text-xs text-slate-500">{vehicle.color} · {vehicle.vehicleType}</p></td>
              <td className="font-mono font-black">{vehicle.plateNumber}</td>
              <td><p className="flex items-center gap-2 font-mono font-black"><Sticker className="size-4 text-leaf-600" />{vehicle.stickerNumber}</p><p className="text-xs text-slate-400">{vehicle.stickerCollection ? "Payment linked" : "Payment not linked"}</p></td>
              <td><p>{shortDate(vehicle.issuedAt)}</p><p className="text-xs text-slate-400">to {vehicle.expiresAt ? shortDate(vehicle.expiresAt) : "No expiry"}</p></td>
              <td><StatusBadge status={vehicle.status} /></td>
              <td><div className="flex flex-wrap justify-end gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/vehicles?edit=${vehicle.id}`}>Edit</Link><form action={deleteVehicleAction}><input type="hidden" name="id" value={vehicle.id} /><DeleteButton /></form></div></td>
            </tr>)}
            {!vehicles.length && <tr><td colSpan={7} className="py-14 text-center"><CarFront className="mx-auto size-7 text-slate-300" /><p className="mt-3 font-bold text-slate-700">No homeowner vehicles registered</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Use the vehicle form above to add the first record. Sticker payment linking and vehicle rules continue to use the existing workflow.</p></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
