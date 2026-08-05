import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { PageHeader } from "@/components/page-header";
import { PaymentHistoryView, PaymentsNav } from "@/components/admin-payment-sections";

import { getPaymentHistoryData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function PaymentHistoryPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requirePermission(Permission.PAYMENTS_READ);
  const query = await searchParams;
  const data = await getPaymentHistoryData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Transaction history" description="Review active and voided payment transactions with receipt and allocation traceability." />
    <PaymentsNav />
    <PaymentHistoryView data={data} query={query} />
  </>;
}
