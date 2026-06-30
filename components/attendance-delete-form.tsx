"use client";

import { useState } from "react";
import { deleteAttendanceAction } from "@/lib/actions/attendance";

export function AttendanceDeleteForm({ id, paid }: { id: string; paid: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn-danger min-h-8 px-3 py-1 text-xs" onClick={() => setOpen(true)}>Delete</button>;
  return <form action={deleteAttendanceAction} className="w-full min-w-64 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-left">
    <input type="hidden" name="id" value={id} />
    <p className="text-xs font-black text-rose-800">{paid ? "Warning: this attendance record is already marked Paid." : "Delete this attendance record?"}</p>
    {paid && <>
      <p className="mt-1 text-xs text-rose-700">It will be audit-logged before removal from the active attendance list.</p>
      <label className="mt-2 flex items-start gap-2 text-xs font-bold text-rose-800"><input type="checkbox" name="acknowledged" required /> I understand this is a paid record.</label>
      <input className="field mt-2 min-h-9 bg-white py-1 text-xs" name="confirmation" placeholder="Type DELETE" pattern="DELETE" required />
    </>}
    <div className="mt-2 flex gap-2"><button className="btn-danger min-h-8 px-3 py-1 text-xs" type="submit">Confirm delete</button><button className="btn-secondary min-h-8 px-3 py-1 text-xs" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}
