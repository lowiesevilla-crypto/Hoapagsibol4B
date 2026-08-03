"use client";

import { CommunityRouteError } from "@/components/homeowner/community/community-cards";

export default function Error() {
  return <CommunityRouteError title="Chat could not load" description="Refresh to reconnect to HOA chat. Private messages were not cached." />;
}
