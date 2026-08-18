import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions, context }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; context?: ReactNode }) {
  return (
    <section className="ui-page-header flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-black uppercase tracking-[.2em] text-[#2f8f70]">{eyebrow}</p> : null}
        <h1 className="mt-2 break-words text-[32px] font-black leading-[1.06] tracking-[-.035em] text-[#0a2d42] sm:text-[38px]">{title}</h1>
        {description ? <div className="mt-2 max-w-4xl text-[14px] leading-6 text-[#6f8294] sm:text-[15px]">{description}</div> : null}
        {context ? <div className="mt-3 flex flex-wrap items-center gap-2">{context}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}
