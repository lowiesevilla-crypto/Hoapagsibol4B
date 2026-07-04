import Link from "next/link";

export default function TenantLoginNotFound() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-5"><section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-xl"><p className="text-sm font-bold uppercase tracking-wider text-rose-700">Tenant not found</p><h1 className="mt-2 text-3xl font-black text-slate-900">This HOA login URL is invalid.</h1><p className="mt-4 leading-7 text-slate-600">Check the tenant slug or contact the HOA Digital Hub platform administrator for the correct login link.</p><Link className="btn-primary mt-6 inline-flex" href="/login">Open default HOA login</Link></section></main>;
}
