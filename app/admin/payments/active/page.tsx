import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { PageHeader } from "@/components/page-header";
import { ActivePaymentsView, PaymentsNav } from "@/components/admin-payment-sections";

import { getActivePaymentsData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function ActivePaymentsPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requirePermission(Permission.PAYMENTS_READ);
  const query = await searchParams;
  const data = await getActivePaymentsData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Active payments" description="View, update, void, and print active payment records through audited payment ledger services." />
    <PaymentsNav />
    <ActivePaymentsView data={data} query={query} />
  </>;
}
