import { randomUUID } from "node:crypto";
import { Role, TenantModule } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav } from "@/components/payments-nav";
import { RecordPaymentAdvanceForm } from "@/components/record-payment-advance-form";
import { requireUser } from "@/lib/auth";
import { isUxActionProgressEnabled } from "@/lib/feature-flags/ux-action-progress";
import { inputDate } from "@/lib/utils";

type RecordPaymentSearchParams = {
  error?: string;
  homeownerId?: string;
};

export default async function RecordPaymentPage({ searchParams }: { searchParams: Promise<RecordPaymentSearchParams> }) {
  const user = await requireUser(Role.ADMIN);
  const query = await searchParams;
  const initialHomeownerId = (query.homeownerId ?? "").trim() || undefined;
  const actionProgressEnabled = isUxActionProgressEnabled({ tenantId: user.tenantId, module: TenantModule.BILLING, role: user.role });
  return <>
    <PageHeader eyebrow="Payments" title="Record payment" description="Search all active homeowners, record current Monthly Dues payments, or accept advance payments even when the homeowner has zero balance." />
    <PaymentsNav />
    {query.error && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    <RecordPaymentAdvanceForm today={inputDate(new Date())} submissionKey={randomUUID()} actionProgressEnabled={actionProgressEnabled} initialHomeownerId={initialHomeownerId} />
  </>;
}
