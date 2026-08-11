import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageDocumentTemplates } from "@/lib/document-template-access";

export async function requireDocumentTemplateAdmin() {
  const user = await requireUser();
  if (!user.roles.some(canManageDocumentTemplates)) redirect("/admin/documents?error=Document%20template%20administration%20requires%20an%20authorized%20admin%20role.");
  return user;
}
