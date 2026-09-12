"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { bulkEmailDeliveryAction } from "@/lib/actions/email-delivery-management";

type BulkRow = {
  id: string;
  status: string;
  type: string;
};

function BulkSubmitButton({
  name,
  value,
  children,
  className,
  disabled,
  confirmation,
}: {
  name: string;
  value: string;
  children: React.ReactNode;
  className: string;
  disabled: boolean;
  confirmation?: string;
}) {
  const { pending } = useFormStatus();
  return <button
    type="submit"
    name={name}
    value={value}
    className={className}
    disabled={disabled || pending}
    onClick={(event) => {
      if (confirmation && !window.confirm(confirmation)) event.preventDefault();
    }}
  >
    {pending ? "Processing…" : children}
  </button>;
}

export function EmailDeliveryBulkActions({
  rows,
  totalFiltered,
  q,
  status,
  type,
  page,
  pageSize,
}: {
  rows: BulkRow[];
  totalFiltered: number;
  q: string;
  status: string;
  type: string;
  page: number;
  pageSize: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const pageIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selectedCount = allFiltered ? totalFiltered : selected.size;
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function togglePage() {
    setAllFiltered(false);
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setAllFiltered(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <form action={bulkEmailDeliveryAction} className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
    <input type="hidden" name="q" value={q} />
    <input type="hidden" name="status" value={status} />
    <input type="hidden" name="type" value={type} />
    <input type="hidden" name="page" value={page} />
    <input type="hidden" name="pageSize" value={pageSize} />
    <input type="hidden" name="selectionMode" value={allFiltered ? "filtered" : "ids"} />
    {!allFiltered && [...selected].map((id) => <input key={id} type="hidden" name="notificationIds" value={id} />)}

    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex cursor-pointer items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={allPageSelected && !allFiltered} onChange={togglePage} className="size-4 rounded border-slate-300" />
          Select page ({pageIds.length})
        </label>
        {totalFiltered > pageIds.length && <button
          type="button"
          className={allFiltered ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setAllFiltered((current) => !current);
            setSelected(new Set());
          }}
        >
          {allFiltered ? `All ${totalFiltered} filtered selected` : `Select all ${totalFiltered} filtered`}
        </button>}
        <span className="font-semibold text-slate-500">{selectedCount} selected</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BulkSubmitButton
          name="bulkAction"
          value="requeue"
          className="btn-primary"
          disabled={selectedCount === 0}
          confirmation="Resend/retry the eligible selected billing and reminder emails through HOAHub's protected delivery queue?"
        >
          Resend / Retry
        </BulkSubmitButton>
        <BulkSubmitButton
          name="bulkAction"
          value="remove"
          className="btn-danger"
          disabled={selectedCount === 0}
          confirmation="Delete the selected queued emails from the active delivery queue? Their audit history will be retained as SKIPPED."
        >
          Delete from queue
        </BulkSubmitButton>
      </div>
    </div>

    <p className="mt-3 text-xs leading-5 text-slate-500">
      Bulk actions are tenant-scoped and server-filtered. Resend/Retry only affects QUEUED or FAILED billing/reminder emails. Delete from queue only affects QUEUED records; it does not hard-delete audit history.
    </p>

    <div className="sr-only" aria-live="polite">{selectedCount} email records selected.</div>

    <div className="hidden">
      {rows.map((row) => <label key={row.id}>
        <input type="checkbox" checked={allFiltered || selected.has(row.id)} onChange={() => toggleRow(row.id)} />
        {row.id}
      </label>)}
    </div>
  </form>;
}

export function EmailDeliveryRowCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (id: string) => void;
}) {
  return <input
    aria-label={`Select email ${id}`}
    type="checkbox"
    checked={checked}
    onChange={() => onChange(id)}
    className="size-4 rounded border-slate-300"
  />;
}
