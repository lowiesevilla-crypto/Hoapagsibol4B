"use client";

import { RequestRouteError } from "@/components/homeowner/requests/request-route-error";

export default function PortalDocumentsError({ reset }: { reset: () => void }) {
  return <RequestRouteError active="documents" reset={reset} />;
}
