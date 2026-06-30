import type { ContractorProfile } from "@prisma/client";
import Link from "next/link";
import { saveContractorAction } from "@/lib/actions/contractors";
import { SubmitButton } from "@/components/ui";

export function ContractorForm({ contractor }: { contractor?: ContractorProfile }) {
  return <form action={saveContractorAction} className="card max-w-4xl space-y-6">
    {contractor && <input type="hidden" name="id" value={contractor.id} />}
    <div><h2 className="text-lg font-black">Contractor information</h2><p className="text-sm text-slate-500">Use this profile when accepting and refunding contractor bonds.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Company or contractor name" name="companyName" defaultValue={contractor?.companyName} required /></div>
      <Field label="Contact person" name="contactPerson" defaultValue={contractor?.contactPerson} required />
      <Field label="Phone" name="phone" type="tel" defaultValue={contractor?.phone} required />
      <Field label="Email" name="email" type="email" defaultValue={contractor?.email ?? ""} />
      <Field label="License / registration number" name="licenseNumber" defaultValue={contractor?.licenseNumber ?? ""} />
      <div className="sm:col-span-2"><Field label="Business address" name="address" defaultValue={contractor?.address} required /></div>
      <div><label className="label" htmlFor="status">Status</label><select className="field" id="status" name="status" defaultValue={contractor?.status ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
    </div>
    <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5"><SubmitButton>{contractor ? "Save changes" : "Create contractor"}</SubmitButton><Link className="btn-secondary" href="/admin/contractors">Cancel</Link></div>
  </form>;
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <div><label className="label" htmlFor={name}>{label}</label><input className="field" id={name} name={name} {...props} /></div>;
}
