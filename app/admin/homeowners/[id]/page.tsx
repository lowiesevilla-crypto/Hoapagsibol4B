import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/ui";
import { HomeownerForm } from "@/components/homeowner-form";
import { PageHeader } from "@/components/page-header";
import { deleteHomeownerAction } from "@/lib/actions/homeowners";
import { prisma } from "@/lib/db";

export default async function EditHomeownerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const homeowner = await prisma.homeownerProfile.findUnique({ where: { id }, include: { user: true } });
  if (!homeowner) notFound();
  return <><PageHeader eyebrow="Homeowners" title={homeowner.user.name} description={`Block ${homeowner.block}, Lot ${homeowner.lot}`} action={<form action={deleteHomeownerAction}><input type="hidden" name="id" value={homeowner.id} /><DeleteButton label="Delete profile" /></form>} /><HomeownerForm homeowner={homeowner} /></>;
}
