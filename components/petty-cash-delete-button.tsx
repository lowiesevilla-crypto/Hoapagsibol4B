"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deletePettyCashVoucherAction } from "@/lib/actions/petty-cash-maintenance";

export function PettyCashDeleteButton({ voucherId, compact = false }: { voucherId: string; compact?: boolean }) {
  return <form
    action={deletePettyCashVoucherAction}
    onSubmit={(event) => {
      if (!window.confirm("Delete this Petty Cash Voucher? Its linked expense entries will also be removed. Employee Cash Advance vouchers can only be deleted before payroll repayment/finalization.")) event.preventDefault();
    }}
    className="inline-flex"
  >
    <input type="hidden" name="voucherId" value={voucherId} />
    <SubmitDeleteButton compact={compact} />
  </form>;
}

function SubmitDeleteButton({ compact }: { compact: boolean }) {
  const { pending } = useFormStatus();
  return <button
    type="submit"
    disabled={pending}
    className={compact
      ? "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-xs font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
      : "btn-secondary inline-flex min-h-11 items-center justify-center gap-2 border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"}
  >
    <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete"}
  </button>;
}
