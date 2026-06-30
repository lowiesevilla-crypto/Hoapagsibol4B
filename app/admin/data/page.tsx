import { BulkDataPanel } from "@/components/bulk-data-panel";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";

export default function AdminDataPage() {
  return <>
    <PageHeader eyebrow="Administration" title="Bulk data upload and download" description="Import master data with validation, download CSV templates, and export current records for backup or reporting." action={<Link className="btn-primary" href="/admin/data/migrations">Migrate previous balances</Link>} />
    <BulkDataPanel />
  </>;
}
