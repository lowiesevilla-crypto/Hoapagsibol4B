import { RequestPageSkeleton } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export default function PortalComplaintsLoading() {
  return <PortalPageContainer><RequestPageSkeleton /></PortalPageContainer>;
}
