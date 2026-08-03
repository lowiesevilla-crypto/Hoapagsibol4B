"use client";

import { RequestRouteError } from "@/components/homeowner/requests/request-route-error";

export default function PortalComplaintsError({ reset }: { reset: () => void }) {
  return <RequestRouteError active="complaints" reset={reset} />;
}
