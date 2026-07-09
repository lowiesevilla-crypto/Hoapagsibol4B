import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { FileText } from "lucide-react";
import Link from "next/link";
import { DeleteButton } from "@/components/ui";
import { HomeownerForm } from "@/components/homeowner-form";
import { PageHeader } from "@/components/page-header";
import { deleteHomeownerAction } from "@/lib/actions/homeowners";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function EditHomeownerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const homeowner = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: user.tenantId }, include: { user: true } });
  if (!homeowner) notFound();
  return <><PageHeader eyebrow="Homeowners" title={homeowner.user.name} description={`Block ${homeowner.block}, Lot ${homeowner.lot}`} action={<><Link className="btn-secondary" href={`/admin/homeowners/${homeowner.id}/soa`}><FileText className="size-4" /> Statement of Account</Link><form action={deleteHomeownerAction}><input type="hidden" name="id" value={homeowner.id} /><DeleteButton label="Delete profile" /></form></>} /><HomeownerForm homeowner={homeowner} /></>;
}
