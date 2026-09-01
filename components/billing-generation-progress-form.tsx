"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateBillingFromPreviewAction, generateBillingFromPreviewProgressAction, type GenerateBillingProgressState } from "@/lib/actions/billing";
import { SubmitButton } from "@/components/ui";

type Props = {
  actionProgressEnabled: boolean;
  coverageYear: number;
  coverageMonth: number;
  scope: string;
  homeownerIds: string[];
  block?: string;
  phase?: string;
};

const initialState: GenerateBillingProgressState = { status: "idle", message: "", createdCount: 0, duplicateCount: 0, exemptCount: 0, failedCount: 0 };

export function BillingGenerationProgressForm({ actionProgressEnabled, coverageYear, coverageMonth, scope, homeownerIds, block, phase }: Props) {
  const router = useRouter();
  const statusRef = useRef<HTMLParagraphElement>(null);
  const idempotencyInputRef = useRef<HTMLInputElement>(null);
  const requestKeyRef = useRef("");
  const navigatedJobRef = useRef("");
  const [state, progressAction] = useActionState(generateBillingFromPreviewProgressAction, initialState);

  useEffect(() => {
    if (!actionProgressEnabled || state.status === "idle") return;
    statusRef.current?.focus();
    if ((state.status === "accepted" || state.status === "success") && state.jobId && navigatedJobRef.current !== state.jobId) {
      navigatedJobRef.current = state.jobId;
      router.push(`/admin/billing/jobs/${encodeURIComponent(state.jobId)}`);
    }
  }, [actionProgressEnabled, router, state.jobId, state.status]);

  function prepareSubmission() {
    if (!actionProgressEnabled || !idempotencyInputRef.current) return;
    if (!requestKeyRef.current) requestKeyRef.current = window.crypto.randomUUID();
    idempotencyInputRef.current.value = requestKeyRef.current;
  }

  return <div className="flex flex-col items-start gap-2">
    <form action={actionProgressEnabled ? progressAction : generateBillingFromPreviewAction} onSubmit={prepareSubmission}>
      <input type="hidden" name="coverageYear" value={coverageYear} />
      <input type="hidden" name="coverageMonth" value={coverageMonth} />
      <input type="hidden" name="scope" value={scope} />
      {actionProgressEnabled && <input ref={idempotencyInputRef} type="hidden" name="idempotencyKey" defaultValue="" />}
      {homeownerIds.map((id) => <input key={id} type="hidden" name="homeownerIds" value={id} />)}
      {scope === "HOMEOWNER" && <input type="hidden" name="homeownerId" value={homeownerIds[0] ?? ""} />}
      {block && <input type="hidden" name="block" value={block} />}
      {phase && <input type="hidden" name="phase" value={phase} />}
      {actionProgressEnabled && state.status === "error" && <p ref={statusRef} tabIndex={-1} role="alert" aria-live="polite" className="mb-3 max-w-xl rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{state.message}</p>}
      {actionProgressEnabled && (state.status === "accepted" || state.status === "success") && <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mb-3 max-w-xl rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{state.message}</p>}
      <SubmitButton
        className="btn-primary min-h-10 px-4 py-2 text-sm"
        actionProgress={actionProgressEnabled}
        pendingLabel={actionProgressEnabled ? "Starting billing job" : "Generating billing"}
        confirmedProcessing={actionProgressEnabled && state.status === "accepted"}
        success={actionProgressEnabled && state.status === "success"}
      >Generate for Eligible Homeowners</SubmitButton>
    </form>
    {actionProgressEnabled && <Link className="text-xs font-bold text-pine-700 hover:underline" href="/admin/billing/jobs">View recent billing jobs</Link>}
  </div>;
}
