"use client";

import { ActionProgressButton } from "@/components/action-progress-button";

export function SubmitButton({ children, className = "btn-primary", disabled = false, actionProgress = true, pendingLabel = "Processing request", confirmedProcessing = false, success = false }: { children: React.ReactNode; className?: string; disabled?: boolean; actionProgress?: boolean; pendingLabel?: string; confirmedProcessing?: boolean; success?: boolean }) {
  return <ActionProgressButton className={className} disabled={disabled} enabled={actionProgress} pendingLabel={pendingLabel} confirmedProcessing={confirmedProcessing} success={success}>{children}</ActionProgressButton>;
}

export function DeleteButton({ label = "Delete" }: { label?: string }) {
  return <button type="submit" className="btn-danger" onClick={(event) => { if (!window.confirm("This cannot be undone. Continue?")) event.preventDefault(); }}>{label}</button>;
}

export function ConfirmSubmitButton({ children, message, name, value, className = "btn-primary" }: { children: React.ReactNode; message: string; name?: string; value?: string; className?: string }) {
  return <button type="submit" name={name} value={value} className={className} formNoValidate={value === "reject"} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>;
}

export function SearchInput({ placeholder = "Search..." }: { placeholder?: string }) {
  return <input className="field max-w-full sm:max-w-xs" type="search" name="q" placeholder={placeholder} onChange={(event) => { const terms = normalizeSearch(event.currentTarget.value).split(" ").filter(Boolean); document.querySelectorAll<HTMLElement>("[data-search]").forEach((row) => { const haystack = normalizeSearch(row.dataset.search || ""); row.hidden = terms.some((term) => !haystack.includes(term)); }); }} />;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._-]+/g, " ")
    .trim();
}
