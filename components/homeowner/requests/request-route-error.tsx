"use client";

import { RefreshCw } from "lucide-react";
import { RequestAreaNavigation, RequestSafeError } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export function RequestRouteError({ active, reset }: { active: "requests" | "documents" | "complaints" | "track"; reset: () => void }) {
  const errorCopy = active === "complaints"
    ? { title: "Complaints temporarily unavailable", description: "Retry loading your complaints. No complaint was submitted and no private complaint details are shown." }
    : undefined;

  return (
    <PortalPageContainer className="space-y-6">
      <RequestAreaNavigation active={active} />
      <RequestSafeError {...errorCopy} />
      <button type="button" onClick={reset} className="btn-primary min-h-12 w-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-pine-500/20 sm:w-auto" aria-label={`Retry loading ${active}`}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Retry
      </button>
    </PortalPageContainer>
  );
}
