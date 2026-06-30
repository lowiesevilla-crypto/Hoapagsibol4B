import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { portalLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { Suspense } from "react";
import { getAssociationSettings } from "@/lib/system-settings";
import { getUnreadChatCount } from "@/lib/services/chat";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.HOMEOWNER);
  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(), getUnreadChatCount(user.id)]);
  return <div className="min-h-screen"><Sidebar user={user} links={portalLinks} roleLabel="Homeowner" association={association} initialChatUnreadCount={initialChatUnreadCount} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
