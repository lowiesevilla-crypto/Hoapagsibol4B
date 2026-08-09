import type { ReactNode } from "react";
import type {
  RepositoryDocumentStatus,
  RepositoryDocumentVisibility,
} from "@/lib/document-repository/constants";
import { RepositoryStatusBadge, RepositoryVisibilityBadge } from "@/components/document-repository/status-badge";

export type RepositoryDocumentCardProps = {
  title: string;
  description?: string | null;
  category: string;
  reference?: string | null;
  revision?: string | null;
  fileLabel: string;
  updatedLabel: string;
  status: RepositoryDocumentStatus;
  visibility: RepositoryDocumentVisibility;
  actions?: ReactNode;
};

export function RepositoryDocumentCard(props: RepositoryDocumentCardProps) {
  return <article className="card flex h-full flex-col gap-4" aria-label={props.title}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-wider text-pine-700">{props.category}</p>
        <h3 className="mt-1 break-words text-lg font-black leading-snug text-ink">{props.title}</h3>
        {props.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{props.description}</p>}
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      <RepositoryStatusBadge status={props.status} />
      <RepositoryVisibilityBadge visibility={props.visibility} />
    </div>

    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-sm">
      {props.reference && <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Reference</dt><dd className="mt-1 truncate font-bold text-slate-700" title={props.reference}>{props.reference}</dd></div>}
      {props.revision && <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Revision</dt><dd className="mt-1 font-bold text-slate-700">{props.revision}</dd></div>}
      <div className="min-w-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">File</dt><dd className="mt-1 truncate font-bold text-slate-700" title={props.fileLabel}>{props.fileLabel}</dd></div>
      <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Updated</dt><dd className="mt-1 font-bold text-slate-700">{props.updatedLabel}</dd></div>
    </dl>

    {props.actions && <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">{props.actions}</div>}
  </article>;
}
