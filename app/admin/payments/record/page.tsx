import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav, RecordPaymentView } from "@/components/admin-payment-sections";
import { requireUser } from "@/lib/auth";
import { getRecordPaymentData, type PaymentQuery } from "@/lib/services/admin-payments";

export default async function RecordPaymentPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const admin = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const data = await getRecordPaymentData(admin, query);
  return <>
    <PageHeader eyebrow="Payments" title="Record payment" description="Search tenant-scoped open balances and post monthly dues payments through the existing receipt workflow." />
    <PaymentsNav />
    <RecordPaymentView data={data} query={query} />
  </>;
}
