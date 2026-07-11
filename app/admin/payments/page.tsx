import { redirect } from "next/navigation";
import type { PaymentQuery } from "@/lib/services/admin-payments";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<PaymentQuery> }) {
  const query = await searchParams;
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1])));
  redirect(`/admin/payments/record${params.size ? `?${params}` : ""}`);
}
