import { onboardingHomeownerTemplateCsv, ONBOARDING_HOMEOWNER_TEMPLATE_VERSION } from "@/lib/services/onboarding-homeowner-import";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user.permissions.includes("homeowners.manage")) return new Response("Forbidden", { status: 403 });
  return new Response(onboardingHomeownerTemplateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="hoahub-homeowners-v${ONBOARDING_HOMEOWNER_TEMPLATE_VERSION}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
