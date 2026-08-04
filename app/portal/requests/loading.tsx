import { RequestPageSkeleton } from "@/components/homeowner/requests/request-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export default function PortalRequestsLoading() {
  return <PortalPageContainer><RequestPageSkeleton /></PortalPageContainer>;
}
