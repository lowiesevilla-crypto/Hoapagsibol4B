import type { ReactNode } from "react";

export function WorkspaceCard({ title, description, action, children, className = "" }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ui-workspace-card min-w-0 rounded-[22px] border border-[#dbe7ee] bg-white shadow-[0_8px_24px_rgba(22,65,87,.05)] ${className}`}>
      {title || description || action ? (
        <header className="flex min-w-0 flex-col gap-3 px-5 pb-2 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-[22px] sm:pt-5">
          <div className="min-w-0">
            {title ? <h2 className="text-[18px] font-black tracking-[-.015em] text-[#0d3349]">{title}</h2> : null}
            {description ? <div className="mt-1 text-[12px] leading-5 text-[#7d8c9b] sm:text-[13px]">{description}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className="min-w-0 p-5 pt-3 sm:p-[22px] sm:pt-3">{children}</div>
    </section>
  );
}
