"use client";

import { PaymentRouteError } from "@/components/homeowner/payments/payment-route-error";

export default function PortalCollectionsError({ reset }: { reset: () => void }) {
  return <PaymentRouteError active="collections" reset={reset} />;
}
