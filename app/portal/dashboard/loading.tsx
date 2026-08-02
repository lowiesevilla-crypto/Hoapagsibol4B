import { DashboardSkeletons } from "@/components/homeowner/dashboard/dashboard-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export default function PortalDashboardLoading() {
  return <PortalPageContainer><DashboardSkeletons /></PortalPageContainer>;
}
