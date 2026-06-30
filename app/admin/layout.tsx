import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { adminLinks, systemAdminLinks } from "@/components/sidebar-links";
import { TransactionFeedback } from "@/components/transaction-feedback";
import { Suspense } from "react";
import { getAssociationSettings } from "@/lib/system-settings";
import { userCanAccessPayroll } from "@/lib/payroll-access";
import { getUnreadChatCount } from "@/lib/services/chat";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(Role.ADMIN);
  const [association, initialChatUnreadCount] = await Promise.all([getAssociationSettings(), getUnreadChatCount(user.id)]);
  const isSystemAdmin = user.role === Role.SYSTEM_ADMIN;
  const canAccessPayroll = await userCanAccessPayroll(user.id, user.role);
  const links = (isSystemAdmin ? systemAdminLinks : adminLinks).filter((item) => canAccessPayroll || !["/admin/employees", "/admin/attendance", "/admin/payroll"].includes(item.href));
  return <div className="min-h-screen"><Sidebar user={user} links={links} roleLabel={isSystemAdmin ? "System Administrator" : "Administrator"} association={association} initialChatUnreadCount={initialChatUnreadCount} /><Suspense><TransactionFeedback /></Suspense><main className="mx-auto min-w-0 max-w-[1800px] px-4 py-6 sm:px-7 lg:ml-72 lg:px-10 lg:py-9">{children}</main></div>;
}
