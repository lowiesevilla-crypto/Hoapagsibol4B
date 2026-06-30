type BillRemarksProps = {
  notes: string | null;
  showSource?: boolean;
};

export function BillRemarks({ notes, showSource = false }: BillRemarksProps) {
  if (!notes) return <span className="text-xs text-slate-400">No remarks</span>;

  const migrationMatch = notes.match(/^\[MIGRATED\]\[([^\]]+)\]\s*/i);
  const withoutTag = notes.replace(/^\[MIGRATED\]\[[^\]]+\]\s*/i, "").trim();
  const sourceMatch = withoutTag.match(/^Source workbook row (\d+);\s*balance as of (\d{4}-\d{2}-\d{2})\.\s*/i);
  const body = withoutTag.replace(/^Source workbook row \d+;\s*balance as of \d{4}-\d{2}-\d{2}\.\s*/i, "").trim();
  const isMigration = Boolean(migrationMatch);
  const migrationLabel = migrationMatch?.[1]?.replaceAll("_", " ").toLowerCase();

  return (
    <details className="group min-w-60 max-w-md rounded-xl border border-slate-200 bg-slate-50 p-3 text-left open:bg-white">
      <summary className="cursor-pointer list-none text-xs font-black text-pine-700 marker:hidden">
        <span className="flex items-center justify-between gap-3">
          <span>{isMigration ? "View migration remarks" : "View billing remarks"}</span>
          <span aria-hidden="true" className="text-base leading-none transition-transform group-open:rotate-45">+</span>
        </span>
        {isMigration && <span className="mt-1 block font-semibold capitalize text-slate-500">{migrationLabel}</span>}
      </summary>
      <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
        {sourceMatch && <p className="font-bold text-slate-700">Balance as of {sourceMatch[2]}</p>}
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{body || withoutTag}</p>
        {showSource && sourceMatch && <p className="text-[11px] text-slate-400">Source workbook row {sourceMatch[1]}</p>}
      </div>
    </details>
  );
}
