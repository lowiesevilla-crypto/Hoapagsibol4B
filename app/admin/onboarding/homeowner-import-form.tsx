"use client";

import { useActionState } from "react";
import { commitOnboardingHomeownersAction, previewOnboardingHomeownersAction, type OnboardingImportState } from "@/lib/actions/onboarding";

const initial: OnboardingImportState = { success: false, committed: false, message: "", imported: 0 };

export function HomeownerImportForm() {
  const [previewState, previewAction, previewPending] = useActionState(previewOnboardingHomeownersAction, initial);
  const [commitState, commitAction, commitPending] = useActionState(commitOnboardingHomeownersAction, initial);
  const state = commitState.message ? commitState : previewState;
  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm" aria-labelledby="homeowner-import-title">
      <div>
        <h2 id="homeowner-import-title" className="text-lg font-semibold">Import homeowners and properties</h2>
        <p className="mt-1 text-sm text-slate-600">Preview first. No records are written until the same file is re-selected and explicitly committed. Passwords are never accepted in CSV.</p>
      </div>
      <a className="inline-flex rounded-md border px-3 py-2 text-sm font-medium" href="/admin/onboarding/template">Download CSV template v1.0</a>
      <form action={previewAction} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="preview-file">CSV file for dry-run validation</label>
        <input id="preview-file" name="file" type="file" accept=".csv,text/csv" required className="block w-full rounded-md border p-2 text-sm" />
        <button type="submit" disabled={previewPending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{previewPending ? "Validating…" : "Preview import"}</button>
      </form>
      {previewState.preview ? <PreviewSummary state={previewState} /> : null}
      <form action={commitAction} className="space-y-3 border-t pt-4">
        <label className="block text-sm font-medium" htmlFor="commit-file">Re-select the validated CSV file</label>
        <input id="commit-file" name="file" type="file" accept=".csv,text/csv" required className="block w-full rounded-md border p-2 text-sm" />
        <label className="block text-sm font-medium" htmlFor="reason">Operational reason</label>
        <textarea id="reason" name="reason" required minLength={10} rows={3} className="block w-full rounded-md border p-2 text-sm" placeholder="Example: Initial pilot homeowner migration approved by the board." />
        <label className="flex items-start gap-2 text-sm"><input name="confirm" type="checkbox" required className="mt-1" /><span>I confirm that the dry-run errors are resolved and authorize creation of homeowner accounts, activation invitations, and any stated opening balances.</span></label>
        <button type="submit" disabled={commitPending} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{commitPending ? "Importing…" : "Commit secure import"}</button>
      </form>
      {state.message ? <p role="status" className={`rounded-md p-3 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{state.message}</p> : null}
      {commitState.preview ? <PreviewSummary state={commitState} /> : null}
    </section>
  );
}

function PreviewSummary({ state }: { state: OnboardingImportState }) {
  const preview = state.preview!;
  return (
    <div className="rounded-md bg-slate-50 p-4 text-sm">
      <p><strong>{preview.totals.rows}</strong> rows · opening balances <strong>₱{preview.totals.openingBalance.toFixed(2)}</strong></p>
      <p className="mt-1 break-all text-xs text-slate-500">Fingerprint: {preview.fingerprint}</p>
      {preview.errors.length ? <ul className="mt-3 max-h-56 space-y-1 overflow-auto text-red-700">{preview.errors.slice(0, 100).map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>Row {error.row || "database"}, {error.field}: {error.message}</li>)}</ul> : <p className="mt-3 font-medium text-emerald-700">Dry-run passed with no validation errors.</p>}
    </div>
  );
}
