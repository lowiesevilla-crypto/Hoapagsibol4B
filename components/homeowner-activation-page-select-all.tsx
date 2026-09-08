"use client";

import { useEffect, useRef } from "react";

type Props = {
  formId: string;
  inputName?: string;
  label?: string;
  ariaLabel?: string;
};

export function HomeownerActivationPageSelectAll({
  formId,
  inputName = "homeownerId",
  label = "Select page",
  ariaLabel = "Select all eligible homeowners on this page",
}: Props) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const selectAll = checkboxRef.current;
    if (!form || !selectAll) return;

    const recipients = () => Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${inputName}"]:not(:disabled)`));
    const sync = () => {
      const rows = recipients();
      const checked = rows.filter((item) => item.checked).length;
      selectAll.checked = rows.length > 0 && checked === rows.length;
      selectAll.indeterminate = checked > 0 && checked < rows.length;
      selectAll.disabled = rows.length === 0;
    };
    const handleChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.name === inputName) sync();
    };

    form.addEventListener("change", handleChange);
    sync();
    return () => form.removeEventListener("change", handleChange);
  }, [formId, inputName]);

  return <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
    <input
      ref={checkboxRef}
      aria-label={ariaLabel}
      type="checkbox"
      onChange={(event) => {
        const form = document.getElementById(formId) as HTMLFormElement | null;
        if (!form) return;
        form.querySelectorAll<HTMLInputElement>(`input[name="${inputName}"]:not(:disabled)`).forEach((item) => {
          item.checked = event.currentTarget.checked;
        });
        event.currentTarget.indeterminate = false;
      }}
    />
    <span className="sr-only xl:not-sr-only">{label}</span>
  </label>;
}
