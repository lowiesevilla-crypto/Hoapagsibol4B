import { revalidatePath } from "next/cache";

export function safeRevalidatePettyCashPages(context: { action: string; tenantId: string; actorId: string; voucherId: string }) {
  const paths = ["/admin/petty-cash", `/admin/petty-cash/${context.voucherId}`, "/admin/expenses", "/admin/reports", "/admin/dashboard", "/admin/payroll"];
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[HOAHub] petty_cash_post_commit_revalidation_failed", {
        ...context,
        path,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}
