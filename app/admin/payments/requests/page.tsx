import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentRequestsView, PaymentsNav } from "@/components/admin-payment-sections";
import { requireUser } from "@/lib/auth";
import { getPaymentRequestsData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function PaymentRequestsPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const data = await getPaymentRequestsData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Manual payment requests" description="Review Manual QR / proof submissions only. PayMongo Online payments are gateway-confirmed and post automatically without tenant approval." />
    <PaymentsNav />
    <PaymentRequestsView data={data} query={query} />
  </>;
}
