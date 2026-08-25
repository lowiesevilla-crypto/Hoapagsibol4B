import Link from "next/link";

const items = [
  ["/admin/payments/record", "Record Payment"],
  ["/admin/payments/requests", "Payment Requests"],
  ["/admin/payments/active", "Active Payments"],
  ["/admin/payments/online", "Online Payments"],
  ["/admin/payments/history", "Transaction History"],
] as const;

export function PaymentsNav() {
  return <nav aria-label="Payments" className="mb-4 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 text-sm font-black shadow-sm">
    {items.map(([href, label]) => <Link key={href} className="btn-secondary min-h-9 shrink-0 px-3 py-1.5" href={href}>{label}</Link>)}
  </nav>;
}
