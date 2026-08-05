import { Permission } from "@/lib/authorization/permissions";
import { requirePermission } from "@/lib/authorization/guards";

import { PageHeader } from "@/components/page-header";
import { PaymentsNav, RecordPaymentView } from "@/components/admin-payment-sections";

import { getRecordPaymentData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function RecordPaymentPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requirePermission(Permission.PAYMENTS_RECORD);
  const query = await searchParams;
  const data = await getRecordPaymentData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Record payment" description="Search tenant-scoped open balances and post monthly dues payments through the existing receipt workflow." />
    <PaymentsNav />
    <RecordPaymentView data={data} query={query} />
  </>;
}
