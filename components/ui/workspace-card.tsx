import type { ReactNode } from "react";

export function WorkspaceCard({ title, description, action, children, className = "" }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-workspace border border-slate-200 bg-surface-card shadow-workspace ${className}`}>
      {title || description || action ? (
        <header className="flex min-w-0 flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-black text-pine-900">{title}</h2> : null}
            {description ? <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className="min-w-0 p-5 sm:p-6">{children}</div>
    </section>
  );
}
