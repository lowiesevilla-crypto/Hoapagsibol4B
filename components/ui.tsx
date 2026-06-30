"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending}>{pending ? "Working..." : children}</button>;
}

export function DeleteButton({ label = "Delete" }: { label?: string }) {
  return <button type="submit" className="btn-danger" onClick={(event) => { if (!window.confirm("This cannot be undone. Continue?")) event.preventDefault(); }}>{label}</button>;
}

export function ConfirmSubmitButton({ children, message, name, value, className = "btn-primary" }: { children: React.ReactNode; message: string; name?: string; value?: string; className?: string }) {
  return <button type="submit" name={name} value={value} className={className} formNoValidate={value === "reject"} onClick={(event) => { if (!window.confirm(message)) event.preventDefault(); }}>{children}</button>;
}

export function SearchInput({ placeholder = "Search..." }: { placeholder?: string }) {
  return <input className="field max-w-full sm:max-w-xs" type="search" name="q" placeholder={placeholder} onChange={(event) => { const term = event.currentTarget.value.toLowerCase(); document.querySelectorAll<HTMLElement>("[data-search]").forEach((row) => { row.hidden = !row.dataset.search?.includes(term); }); }} />;
}
