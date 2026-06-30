import { notFound } from "next/navigation";
import { ContractorForm } from "@/components/contractor-form";
import { PageHeader } from "@/components/page-header";
import { DeleteButton } from "@/components/ui";
import { deleteContractorAction } from "@/lib/actions/contractors";
import { prisma } from "@/lib/db";

export default async function EditContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contractor = await prisma.contractorProfile.findUnique({ where: { id } });
  if (!contractor) notFound();
  return <><PageHeader eyebrow="Contractors" title={contractor.companyName} description={contractor.contactPerson} action={<form action={deleteContractorAction}><input type="hidden" name="id" value={contractor.id} /><DeleteButton label="Delete profile" /></form>} /><ContractorForm contractor={contractor} /></>;
}
