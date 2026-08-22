import { randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { PaymentsNav } from "@/components/admin-payment-sections";
import { RecordPaymentAdvanceForm } from "@/components/record-payment-advance-form";
import { requireUser } from "@/lib/auth";
import { inputDate } from "@/lib/utils";

export default async function RecordPaymentPage() {
  await requireUser(Role.ADMIN);
  return <>
    <PageHeader eyebrow="Payments" title="Record payment" description="Search all active homeowners, record current Monthly Dues payments, or accept advance payments even when the homeowner has zero balance." />
    <PaymentsNav />
    <RecordPaymentAdvanceForm today={inputDate(new Date())} submissionKey={randomUUID()} />
  </>;
}
