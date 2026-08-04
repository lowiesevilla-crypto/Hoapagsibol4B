"use client";

import { PaymentRouteError } from "@/components/homeowner/payments/payment-route-error";

export default function PortalPayError({ reset }: { reset: () => void }) {
  return <PaymentRouteError active="pay" reset={reset} />;
}
