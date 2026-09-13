"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function EmailDeliverySelectPage({ count }: { count: number }) {
  const [checked, setChecked] = useState(false);
  return <label className={`inline-flex items-center gap-2 font-bold ${count > 0 ? "cursor-pointer text-slate-700" : "cursor-not-allowed text-slate-400"}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={count === 0}
      onChange={(event) => {
        const next = event.currentTarget.checked;
        setChecked(next);
        const form = event.currentTarget.closest("form");
        form?.querySelectorAll<HTMLInputElement>('input[name="notificationIds"]:not(:disabled)').forEach((checkbox) => {
          checkbox.checked = next;
        });
      }}
      className="size-4 rounded border-slate-300"
    />
    Select actionable rows on page ({count})
  </label>;
}

export function EmailDeliveryBulkSubmitButton({
  value,
  children,
  className,
  confirmation,
}: {
  value: "requeue" | "remove";
  children: React.ReactNode;
  className: string;
  confirmation: string;
}) {
  const { pending } = useFormStatus();
  return <button
    type="submit"
    name="bulkAction"
    value={value}
    className={className}
    disabled={pending}
    onClick={(event) => {
      const form = event.currentTarget.closest("form");
      const allFiltered = form?.querySelector<HTMLInputElement>('input[name="selectAllFiltered"]')?.checked;
      const selected = form?.querySelectorAll<HTMLInputElement>('input[name="notificationIds"]:checked:not(:disabled)').length || 0;
      if (!allFiltered && selected === 0) {
        window.alert("Select at least one actionable email record, or choose Apply to all filtered eligible records.");
        event.preventDefault();
        return;
      }
      if (!window.confirm(confirmation)) event.preventDefault();
    }}
  >
    {pending ? "Processing…" : children}
  </button>;
}
