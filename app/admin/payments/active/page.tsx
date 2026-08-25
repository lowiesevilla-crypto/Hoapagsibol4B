import { Role } from "@prisma/client";
import { ActivePaymentsView } from "@/components/admin-payment-sections";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav } from "@/components/payments-nav";
import { requireUser } from "@/lib/auth";
import { getActivePaymentsData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function ActivePaymentsPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const data = await getActivePaymentsData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Active payments" description="View, update, void, and print active payment records through audited payment ledger services." />
    <PaymentsNav />
    <ActivePaymentsView data={data} query={query} />
  </>;
}
