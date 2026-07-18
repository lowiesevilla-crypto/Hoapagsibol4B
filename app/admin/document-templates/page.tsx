import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function DocumentTemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  await requireUser();
  await searchParams;
  redirect("/admin/documents?section=templates&notice=legacy-templates");
}
