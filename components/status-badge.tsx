import { statusTone } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ring-1 ring-inset ring-black/5 ${statusTone(status)}`}><span className="size-1.5 shrink-0 rounded-full bg-current opacity-70" aria-hidden="true" />{label}</span>;
}
