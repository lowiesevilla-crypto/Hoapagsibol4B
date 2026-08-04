"use client";

import { PaymentRouteError } from "@/components/homeowner/payments/payment-route-error";

export default function PortalSoaError({ reset }: { reset: () => void }) {
  return <PaymentRouteError active="soa" reset={reset} />;
}
