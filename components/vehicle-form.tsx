import Link from "next/link";
import type { Collection, HomeownerProfile, User, Vehicle } from "@prisma/client";
import { SubmitButton } from "@/components/ui";
import { inputDate, money, shortDate } from "@/lib/utils";
import { saveVehicleAction } from "@/lib/actions/vehicles";

type Owner = HomeownerProfile & { user: User };
type Sticker = Collection & { homeowner: (HomeownerProfile & { user: User }) | null };

export function VehicleForm({ homeowners, stickerCollections, vehicle }: { homeowners: Owner[]; stickerCollections: Sticker[]; vehicle?: Vehicle }) {
  return <form action={saveVehicleAction} className="card mb-6">{vehicle && <input type="hidden" name="id" value={vehicle.id} />}
    <div className="mb-5"><h2 className="text-lg font-black">{vehicle ? "Edit vehicle and sticker" : "Register a vehicle"}</h2><p className="text-sm text-slate-500">Plate and sticker numbers must be unique across the association.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="sm:col-span-2"><label className="label">Homeowner</label><select className="field" name="homeownerId" defaultValue={vehicle?.homeownerId} required><option value="">Select homeowner</option>{homeowners.map((owner) => <option key={owner.id} value={owner.id}>{owner.user.name} - Block {owner.block}, Lot {owner.lot}</option>)}</select></div>
      <div><label className="label">Plate number</label><input className="field uppercase" name="plateNumber" defaultValue={vehicle?.plateNumber} placeholder="ABC-1234" required /></div>
      <div><label className="label">Vehicle type</label><select className="field" name="vehicleType" defaultValue={vehicle?.vehicleType ?? "Sedan"}><option>Sedan</option><option>SUV</option><option>Pickup</option><option>Van</option><option>Motorcycle</option><option>Tricycle</option><option>Other</option></select></div>
      <div><label className="label">Make</label><input className="field" name="make" defaultValue={vehicle?.make} placeholder="Toyota" required /></div><div><label className="label">Model</label><input className="field" name="model" defaultValue={vehicle?.model} placeholder="Vios" required /></div><div><label className="label">Color</label><input className="field" name="color" defaultValue={vehicle?.color} required /></div>
      <div><label className="label">Sticker number</label><input className="field uppercase" name="stickerNumber" defaultValue={vehicle?.stickerNumber} placeholder="PV26-0001" required /></div>
      <div className="sm:col-span-2"><label className="label">Related sticker payment (optional)</label><select className="field" name="stickerCollectionId" defaultValue={vehicle?.stickerCollectionId ?? ""}><option value="">Not linked</option>{stickerCollections.map((item) => <option key={item.id} value={item.id}>{item.homeowner?.user.name} - {shortDate(item.collectionDate)} - {money(item.amount)} ({item.receiptNumber || item.referenceNumber || "No. pending"})</option>)}</select></div>
      <div><label className="label">Issued date</label><input className="field" name="issuedAt" type="date" defaultValue={vehicle ? inputDate(vehicle.issuedAt) : inputDate(new Date())} required /></div><div><label className="label">Expiry date</label><input className="field" name="expiresAt" type="date" defaultValue={vehicle?.expiresAt ? inputDate(vehicle.expiresAt) : ""} /></div>
      <div><label className="label">Status</label><select className="field" name="status" defaultValue={vehicle?.status ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="EXPIRED">Expired</option></select></div>
      <div className="sm:col-span-2 xl:col-span-3"><label className="label">Remarks</label><input className="field" name="remarks" defaultValue={vehicle?.remarks ?? ""} /></div>
    </div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><SubmitButton>{vehicle ? "Save changes" : "Register vehicle"}</SubmitButton>{vehicle && <Link className="btn-secondary" href="/admin/vehicles">Cancel</Link>}</div>
  </form>;
}
