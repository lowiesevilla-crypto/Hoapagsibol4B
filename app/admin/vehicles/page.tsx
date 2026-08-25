import Link from "next/link";
import { CarFront, Sticker } from "lucide-react";
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
  return <><PageHeader eyebrow="Community security" title="Vehicle and sticker monitoring" description="Register homeowner vehicles, track HOA stickers, payment links, and expiry status." />
    <VehicleForm homeowners={homeowners} stickerCollections={stickerCollections} vehicle={selected ?? undefined} />
    <div className="mb-4"><SearchInput placeholder="Search owner, plate, sticker, make or model" /></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Homeowner</th><th>Vehicle</th><th>Plate</th><th>Sticker</th><th>Validity</th><th>Status</th><th></th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id} data-search={`${vehicle.homeowner.user.name} ${vehicle.homeowner.block} ${vehicle.homeowner.lot} ${vehicle.plateNumber} ${vehicle.stickerNumber} ${vehicle.make} ${vehicle.model} ${vehicle.color}`.toLowerCase()}><td><p className="font-bold">{vehicle.homeowner.user.name}</p><p className="text-xs text-slate-400">B{vehicle.homeowner.block} L{vehicle.homeowner.lot}</p></td><td><p className="flex items-center gap-2 font-semibold"><CarFront className="size-4 text-pine-600" />{vehicle.make} {vehicle.model}</p><p className="text-xs text-slate-500">{vehicle.color} · {vehicle.vehicleType}</p></td><td className="font-mono font-black">{vehicle.plateNumber}</td><td><p className="flex items-center gap-2 font-mono font-black"><Sticker className="size-4 text-leaf-600" />{vehicle.stickerNumber}</p><p className="text-xs text-slate-400">{vehicle.stickerCollection ? "Payment linked" : "Not linked"}</p></td><td><p>{shortDate(vehicle.issuedAt)}</p><p className="text-xs text-slate-400">to {vehicle.expiresAt ? shortDate(vehicle.expiresAt) : "No expiry"}</p></td><td><StatusBadge status={vehicle.status} /></td><td><div className="flex justify-end gap-2"><Link className="btn-secondary min-h-8 px-3 py-1" href={`/admin/vehicles?edit=${vehicle.id}`}>Edit</Link><form action={deleteVehicleAction}><input type="hidden" name="id" value={vehicle.id} /><DeleteButton /></form></div></td></tr>)}{!vehicles.length && <tr><td colSpan={7} className="py-12 text-center text-slate-500">No homeowner vehicles registered.</td></tr>}</tbody></table></div>
  </>;
}
