import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { PageHeader } from "@/components/page-header";
import { PaymentRequestsView, PaymentsNav } from "@/components/admin-payment-sections";

import { getPaymentRequestsData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function PaymentRequestsPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requirePermission(Permission.PAYMENTS_READ);
  const query = await searchParams;
  const data = await getPaymentRequestsData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Payment requests" description="Review pending QR/GCash requests and keep official receipts connected to the payment workflow." />
    <PaymentsNav />
    <PaymentRequestsView data={data} query={query} />
  </>;
}
