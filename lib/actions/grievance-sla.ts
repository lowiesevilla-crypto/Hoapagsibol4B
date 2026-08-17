"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireComplaintAdmin } from "@/lib/services/complaints";
import { assertGrievanceActorEligible } from "@/lib/services/grievance-authorization";
import { setGrievanceOperationalSlaPause } from "@/lib/services/grievance-sla";

export async function setGrievanceOperationalSlaPauseAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = String(formData.get("complaintId") || "").trim().slice(0, 191);
  try {
    assertGrievanceActorEligible(user);
    await setGrievanceOperationalSlaPause(user, {
      complaintId,
      grievanceCaseId: String(formData.get("grievanceCaseId") || "").trim().slice(0, 191),
      paused: String(formData.get("slaAction") || "") === "pause",
      reason: String(formData.get("reason") || "").trim().slice(0, 2000) || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operational SLA state could not be updated.";
    redirect(`/admin/complaints/${encodeURIComponent(complaintId)}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  redirect(`/admin/complaints/${encodeURIComponent(complaintId)}?success=${encodeURIComponent("Operational SLA state updated.")}`);
}
