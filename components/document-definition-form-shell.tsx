"use client";

import Link from "next/link";
import { useState } from "react";

export function DocumentDefinitionFormShell({
  action,
  children,
  resetHref,
  editing,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  resetHref: string;
  editing: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  return <form action={action} onChange={() => setDirty(true)} onReset={() => setDirty(false)} className="mt-4 space-y-5">
    {dirty && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">
      <p className="font-black">Unsaved changes</p>
      <p>The effective configuration summary reflects the last saved version.</p>
    </div>}
    {children}
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <button className="btn-primary" type="submit">{editing ? "Save Changes" : "Create Definition"}</button>
      <Link className="btn-secondary" href={resetHref}>Cancel Changes</Link>
      <button className="btn-secondary" type="reset">Reset to Saved Values</button>
    </div>
  </form>;
}

