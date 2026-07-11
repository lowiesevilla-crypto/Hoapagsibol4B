import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentHistoryView, PaymentsNav } from "@/components/admin-payment-sections";
import { requireUser } from "@/lib/auth";
import { getPaymentHistoryData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function PaymentHistoryPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const data = await getPaymentHistoryData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Transaction history" description="Review voided payment transactions preserved for audit and receipt traceability." />
    <PaymentsNav />
    <PaymentHistoryView data={data} query={query} />
  </>;
}
