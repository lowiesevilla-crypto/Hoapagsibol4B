import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav } from "@/components/admin-payment-sections";
import { RecordPaymentAdvanceForm } from "@/components/record-payment-advance-form";
import { requireUser } from "@/lib/auth";
import { inputDate } from "@/lib/utils";

export default async function RecordPaymentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser(Role.ADMIN);
  const query = await searchParams;
  return <>
    <PageHeader eyebrow="Payments" title="Record payment" description="Search all active homeowners, record current Monthly Dues payments, or accept advance payments even when the homeowner has zero balance." />
    <PaymentsNav />
    {query.error && <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    <RecordPaymentAdvanceForm today={inputDate(new Date())} submissionKey={randomUUID()} />
  </>;
}
