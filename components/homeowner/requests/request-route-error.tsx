"use client";

import { RefreshCw } from "lucide-react";
import { RequestAreaNavigation, RequestSafeError } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export function RequestRouteError({ active, reset }: { active: "requests" | "documents" | "complaints" | "track"; reset: () => void }) {
  return (
    <PortalPageContainer className="space-y-6">
      <RequestAreaNavigation active={active} />
      <RequestSafeError />
      <button type="button" onClick={reset} className="btn-primary min-h-12 w-full sm:w-auto">
        <RefreshCw className="size-4" />
        Retry
      </button>
    </PortalPageContainer>
  );
}
