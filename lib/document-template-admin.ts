import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManageDocumentTemplates } from "@/lib/document-template-access";

export async function requireDocumentTemplateAdmin() {
  const user = await requireUser();
  if (!canManageDocumentTemplates(user.role)) redirect("/admin/documents?error=Document%20template%20administration%20requires%20an%20authorized%20admin%20role.");
  return user;
}
