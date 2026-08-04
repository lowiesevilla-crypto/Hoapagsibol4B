"use client";

import { RefreshCw } from "lucide-react";
import { PaymentAreaNavigation, PaymentSafeError } from "@/components/homeowner/payments/payment-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export function PaymentRouteError({ active, reset }: { active: "pay" | "billing" | "soa" | "payments" | "collections"; reset: () => void }) {
  return (
    <PortalPageContainer className="space-y-6">
      <PaymentAreaNavigation active={active} />
      <PaymentSafeError />
      <button type="button" onClick={reset} className="btn-primary min-h-12 w-full sm:w-auto">
        <RefreshCw className="size-4" />
        Retry
      </button>
    </PortalPageContainer>
  );
}
