import { requirePermission } from "@/lib/authorization/guards";
import { Permission } from "@/lib/authorization/permissions";
import { onboardingHomeownerTemplateCsv, ONBOARDING_HOMEOWNER_TEMPLATE_VERSION } from "@/lib/onboarding/csv";

export async function GET() {
  await requirePermission(Permission.HOMEOWNERS_MANAGE);
  return new Response(onboardingHomeownerTemplateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hoahub-homeowners-onboarding-v${ONBOARDING_HOMEOWNER_TEMPLATE_VERSION}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
