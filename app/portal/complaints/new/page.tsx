import { ComplaintIntakeForm } from "@/components/complaint-intake-form";
import { PageHeader } from "@/components/page-header";
import { getComplaintCategories, requireComplaintHomeowner } from "@/lib/services/complaints";

export default async function NewComplaintPage() {
  const user = await requireComplaintHomeowner();
  const categories = await getComplaintCategories(user.tenantId);
  return <>
    <PageHeader eyebrow="Complaint intake" title="Submit Complaint" description="Submit a named, confidential, or anonymous complaint to the HOA office." />
    <ComplaintIntakeForm categories={categories.map((item) => ({ id: item.id, name: item.name }))} />
  </>;
}
