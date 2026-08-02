"use client";

import { PaymentRouteError } from "@/components/homeowner/payments/payment-route-error";

export default function PortalBillingError({ reset }: { reset: () => void }) {
  return <PaymentRouteError active="billing" reset={reset} />;
}
