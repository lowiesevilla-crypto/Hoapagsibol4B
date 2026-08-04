import { PaymentPageSkeleton } from "@/components/homeowner/payments/payment-cards";
import { PortalPageContainer } from "@/components/portal-mobile-shell";

export default function PortalCollectionsLoading() {
  return <PortalPageContainer><PaymentPageSkeleton /></PortalPageContainer>;
}
