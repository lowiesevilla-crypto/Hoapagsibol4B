import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { onboardingErrorCsv } from "@/lib/onboarding/csv";
import { getTenantOnboardingState } from "@/lib/onboarding/state";

export async function GET() {
  const actor = await requirePermission(Permission.HOMEOWNERS_MANAGE);
  const state = await getTenantOnboardingState(actor.tenantId);
  return new Response(onboardingErrorCsv(state.import?.errors ?? []), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=hoahub-onboarding-validation-errors.csv",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
