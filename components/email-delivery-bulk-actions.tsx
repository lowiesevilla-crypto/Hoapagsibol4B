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
        form?.querySelectorAll<HTMLInputElement>('input[name="notificationIds"]:not(:disabled), input[name="archiveIds"]:not(:disabled)').forEach((checkbox) => {
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
  confirmationPhrase,
  selectedInputName = "notificationIds",
}: {
  value: "requeue" | "remove" | "archive" | "purge" | "purgeArchived";
  children: React.ReactNode;
  className: string;
  confirmation: string;
  confirmationPhrase?: string;
  selectedInputName?: "notificationIds" | "archiveIds";
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
      const selected = form?.querySelectorAll<HTMLInputElement>(`input[name="${selectedInputName}"]:checked:not(:disabled)`).length || 0;
      if (!allFiltered && selected === 0) {
        window.alert("Select at least one actionable record, or choose Apply to all filtered eligible records.");
        event.preventDefault();
        return;
      }
      if (!window.confirm(confirmation)) {
        event.preventDefault();
        return;
      }
      if (confirmationPhrase) {
        const typed = window.prompt(`Type ${confirmationPhrase} to confirm this irreversible action.`);
        if (typed !== confirmationPhrase) {
          window.alert("Confirmation phrase did not match. No records were deleted.");
          event.preventDefault();
        }
      }
    }}
  >
    {pending ? "Processing…" : children}
  </button>;
}
