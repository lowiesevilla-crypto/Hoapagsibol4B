import type { HomeownerProfile, User } from "@prisma/client";
import Link from "next/link";
import { saveHomeownerAction } from "@/lib/actions/homeowners";
import { SubmitButton } from "@/components/ui";

type Record = HomeownerProfile & { user: Pick<User, "name" | "email"> };

export function HomeownerForm({ homeowner }: { homeowner?: Record }) {
  return <form action={saveHomeownerAction} className="card max-w-4xl space-y-6">
    {homeowner && <input type="hidden" name="id" value={homeowner.id} />}
    <div><h2 className="text-lg font-black">Account information</h2><p className="text-sm text-slate-500">Login details and primary contact name.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" name="name" defaultValue={homeowner?.user.name} required />
      <Field label="Email" name="email" type="email" defaultValue={homeowner?.user.email} required />
      <Field label={homeowner ? "New password (optional)" : "Temporary password"} name="password" type="password" minLength={8} required={!homeowner} />
      <Field label="Phone" name="phone" type="tel" defaultValue={homeowner?.phone} required />
    </div>
    <div className="border-t border-slate-100 pt-6"><h2 className="text-lg font-black">Certificate information</h2><p className="text-sm text-slate-500">Used in the Personal Information and Property Information panels of official certificates.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Birth date" name="birthDate" type="date" defaultValue={homeowner?.birthDate?.toISOString().slice(0, 10)} />
      <Field label="Civil status" name="civilStatus" defaultValue={homeowner?.civilStatus || ""} placeholder="Married, Single, etc." />
      <Field label="Citizenship" name="citizenship" defaultValue={homeowner?.citizenship || ""} />
      <Field label="Occupation" name="occupation" defaultValue={homeowner?.occupation || ""} />
      <Field label="Date of residency" name="residencyDate" type="date" defaultValue={homeowner?.residencyDate?.toISOString().slice(0, 10)} />
      <Field label="Phase" name="phase" defaultValue={homeowner?.phase || ""} placeholder="Pagsibol Village Phase 2" />
      <Field label="Property type" name="propertyType" defaultValue={homeowner?.propertyType || ""} placeholder="Residential" />
      <Field label="Occupancy status" name="occupancyStatus" defaultValue={homeowner?.occupancyStatus || ""} placeholder="Owner-Occupied" />
    </div>
    <div className="border-t border-slate-100 pt-6"><h2 className="text-lg font-black">Property and dues</h2><p className="text-sm text-slate-500">Unit identity, account status, and standard monthly charge.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Complete address" name="address" defaultValue={homeowner?.address} required /></div>
      <Field label="Block" name="block" defaultValue={homeowner?.block} required />
      <Field label="Lot" name="lot" defaultValue={homeowner?.lot} required />
      <Field label="Messenger ID" name="messengerId" defaultValue={homeowner?.messengerId ?? ""} />
      <Field label="Monthly dues (PHP)" name="monthlyDuesAmount" type="number" defaultValue={homeowner ? String(homeowner.monthlyDuesAmount) : "1200"} min="0.01" step="0.01" required />
      <div><label className="label" htmlFor="status">Status</label><select className="field" id="status" name="status" defaultValue={homeowner?.status ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
    </div>
    <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5"><SubmitButton>{homeowner ? "Save changes" : "Create homeowner"}</SubmitButton><Link className="btn-secondary" href="/admin/homeowners">Cancel</Link></div>
  </form>;
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <div><label className="label" htmlFor={name}>{label}</label><input className="field" id={name} name={name} {...props} /></div>;
}
