import { redirect } from "next/navigation";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";

export default async function DocumentTemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  await requireDocumentTemplateAdmin();
  await searchParams;
  redirect("/admin/documents?section=templates&notice=legacy-templates");
}
