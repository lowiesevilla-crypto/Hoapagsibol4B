"use client";

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
  const [state, progressAction] = useActionState(generateBillingFromPreviewProgressAction, initialState);

  useEffect(() => {
    if (!actionProgressEnabled || state.status === "idle") return;
    statusRef.current?.focus();
    if (state.status === "success") router.refresh();
  }, [actionProgressEnabled, router, state.status]);

  return <form action={actionProgressEnabled ? progressAction : generateBillingFromPreviewAction}>
    <input type="hidden" name="coverageYear" value={coverageYear} />
    <input type="hidden" name="coverageMonth" value={coverageMonth} />
    <input type="hidden" name="scope" value={scope} />
    {homeownerIds.map((id) => <input key={id} type="hidden" name="homeownerIds" value={id} />)}
    {scope === "HOMEOWNER" && <input type="hidden" name="homeownerId" value={homeownerIds[0] ?? ""} />}
    {block && <input type="hidden" name="block" value={block} />}
    {phase && <input type="hidden" name="phase" value={phase} />}
    {actionProgressEnabled && state.status === "error" && <p ref={statusRef} tabIndex={-1} role="alert" aria-live="polite" className="mb-3 max-w-xl rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{state.message}</p>}
    {actionProgressEnabled && state.status === "success" && <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className="mb-3 max-w-xl rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{state.message}</p>}
    <SubmitButton className="btn-primary min-h-10 px-4 py-2 text-sm" actionProgress={actionProgressEnabled} pendingLabel="Generating billing" success={actionProgressEnabled && state.status === "success"}>Generate for Eligible Homeowners</SubmitButton>
  </form>;
}
