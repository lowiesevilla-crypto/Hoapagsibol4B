export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="relative mb-7 overflow-hidden rounded-workspace border border-slate-200 bg-white/95 px-4 py-5 shadow-workspace backdrop-blur-sm sm:px-6 sm:py-6">
    <span className="pointer-events-none absolute inset-y-5 left-0 w-1 rounded-r-full bg-gradient-to-b from-leaf-500 via-pine-500 to-platform-500" />
    <span className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-pine-50" />
    <span className="pointer-events-none absolute -bottom-20 right-32 size-36 rounded-full bg-leaf-50/80" />
    <div className="relative flex min-w-0 flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 break-words text-xs font-extrabold uppercase tracking-[.18em] text-leaf-700">{eyebrow}</p>}
        <h1 className="break-words text-2xl font-black tracking-tight text-pine-900 sm:text-3xl lg:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:shrink-0 lg:justify-end">{action}</div>}
    </div>
  </header>;
}
