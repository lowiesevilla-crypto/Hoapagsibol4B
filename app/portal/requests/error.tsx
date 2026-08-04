"use client";

import { RequestRouteError } from "@/components/homeowner/requests/request-route-error";

export default function PortalRequestsError({ reset }: { reset: () => void }) {
  return <RequestRouteError active="requests" reset={reset} />;
}
