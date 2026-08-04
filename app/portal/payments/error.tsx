"use client";

import { PaymentRouteError } from "@/components/homeowner/payments/payment-route-error";

export default function PortalPaymentsError({ reset }: { reset: () => void }) {
  return <PaymentRouteError active="payments" reset={reset} />;
}
