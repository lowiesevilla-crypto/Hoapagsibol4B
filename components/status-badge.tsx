import { statusTone } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-black/5 ${statusTone(status)}`}><span className="size-1.5 rounded-full bg-current opacity-70" />{label}</span>;
}
