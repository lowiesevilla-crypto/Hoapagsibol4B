"use client";

import { useMemo, useState } from "react";

const options = [
  {
    value: "IGNORE_BALANCE",
    label: "Allow Download With Balance",
    helper: "Unrelated HOA balances do not prevent download or printing after official issuance. Document-specific fees must still be confirmed before issuance.",
  },
  {
    value: "BLOCK_DOWNLOAD",
    label: "Block When Balance Exists",
    helper: "The request may proceed, but download and printing remain locked until the qualifying balance is settled.",
  },
  {
    value: "ALLOW_ADMIN_OVERRIDE",
    label: "Allow Admin Override",
    helper: "Download is normally blocked, but an authorized administrator may permit release for an individual request.",
  },
] as const;

export function DocumentBalancePolicyControls({ defaultPolicy = "BLOCK_DOWNLOAD" }: { defaultPolicy?: string | null }) {
  const initialPolicy = options.some((option) => option.value === defaultPolicy) ? defaultPolicy! : "BLOCK_DOWNLOAD";
  const [policy, setPolicy] = useState(initialPolicy);
  const selected = useMemo(() => options.find((option) => option.value === policy) ?? options[1], [policy]);
  return (
    <label className="md:col-span-2 xl:col-span-4">
      <span className="label">Outstanding Balance Policy</span>
      <select className="field" name="outstandingBalancePolicy" value={policy} onChange={(event) => setPolicy(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <span className="mt-1 block text-xs font-semibold text-slate-500">{selected.helper}</span>
    </label>
  );
}
