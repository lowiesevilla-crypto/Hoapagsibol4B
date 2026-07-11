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
    <PageHeader eyebrow="Payments" title="Payment requests" description="Review pending QR/GCash requests and keep official receipts connected to the payment workflow." />
    <PaymentsNav />
    <PaymentRequestsView data={data} query={query} />
  </>;
}
