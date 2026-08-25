import { Role } from "@prisma/client";
import { PaymentHistoryView } from "@/components/admin-payment-sections";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav } from "@/components/payments-nav";
import { requireUser } from "@/lib/auth";
import { getPaymentHistoryData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function PaymentHistoryPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const data = await getPaymentHistoryData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Transaction history" description="Review active and voided payment transactions with receipt and allocation traceability." />
    <PaymentsNav />
    <PaymentHistoryView data={data} query={query} />
  </>;
}
