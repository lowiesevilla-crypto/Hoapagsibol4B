import type {
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";

const base = "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-extrabold leading-none";

const statusStyles: Record<RepositoryDocumentStatus, string> = {
  DRAFT: "border-amber-200 bg-amber-50 text-amber-800",
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  INACTIVE: "border-slate-200 bg-slate-50 text-slate-700",
  ARCHIVED: "border-slate-300 bg-slate-100 text-slate-700",
};

const visibilityStyles: Record<RepositoryDocumentVisibility, string> = {
  INTERNAL: "border-slate-200 bg-slate-50 text-slate-700",
  TENANT_PUBLIC: "border-sky-200 bg-sky-50 text-sky-800",
  RESTRICTED: "border-violet-200 bg-violet-50 text-violet-800",
};

const statusLabels: Record<RepositoryDocumentStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  INACTIVE: "Inactive",
  ARCHIVED: "Archived",
};

const visibilityLabels: Record<RepositoryDocumentVisibility, string> = {
  INTERNAL: "Internal",
  TENANT_PUBLIC: "Tenant public",
  RESTRICTED: "Restricted",
};

export function RepositoryStatusBadge({ status }: { status: RepositoryDocumentStatus }) {
  return <span className={`${base} ${statusStyles[status]}`} aria-label={`Document status: ${statusLabels[status]}`}>{statusLabels[status]}</span>;
}

export function RepositoryVisibilityBadge({ visibility }: { visibility: RepositoryDocumentVisibility }) {
  return <span className={`${base} ${visibilityStyles[visibility]}`} aria-label={`Document visibility: ${visibilityLabels[visibility]}`}>{visibilityLabels[visibility]}</span>;
}
