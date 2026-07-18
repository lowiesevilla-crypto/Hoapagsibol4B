"use client";

import { useMemo, useState } from "react";

const options = [
  {
    value: "IGNORE_BALANCE",
    label: "Ignore Outstanding Balance",
    helper: "Existing HOA balances will not prevent this document from being requested, downloaded, or printed.",
  },
  {
    value: "BLOCK_DOWNLOAD",
    label: "Block Download When Balance Exists",
    helper: "The request may proceed, but download and printing remain locked until the qualifying balance is settled.",
  },
  {
    value: "BLOCK_REQUEST",
    label: "Block Request When Balance Exists",
    helper: "The homeowner cannot submit this request while a qualifying balance exists.",
  },
  {
    value: "ALLOW_ADMIN_OVERRIDE",
    label: "Allow Admin Override",
    helper: "Download is normally blocked, but an authorized administrator may permit release for an individual request.",
  },
] as const;

export function DocumentBalancePolicyControls({ defaultPolicy = "BLOCK_DOWNLOAD" }: { defaultPolicy?: string | null }) {
  const [policy, setPolicy] = useState(defaultPolicy || "BLOCK_DOWNLOAD");
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
