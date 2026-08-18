import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions, context }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; context?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-extrabold uppercase tracking-[.18em] text-leaf-700">{eyebrow}</p> : null}
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-pine-900 sm:text-4xl">{title}</h1>
        {description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</div> : null}
        {context ? <div className="mt-3 flex flex-wrap items-center gap-2">{context}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}
