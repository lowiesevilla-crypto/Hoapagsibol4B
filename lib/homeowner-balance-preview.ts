export const HOMEOWNER_BALANCE_PREVIEW_PAGE_SIZE = 25;

type SearchableHomeownerBalanceRow = {
  homeownerName: string;
  accountNumber?: string | null;
  block: string | number;
  lot: string | number;
  phase?: string | null;
};

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLocaleLowerCase("en-PH")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Wild/partial search across the complete tenant-scoped report result set.
 * Every normalized search token must appear somewhere in the homeowner name,
 * account number, block, lot, or phase haystack. Filtering intentionally occurs
 * before pagination so a match on any report row can be found regardless of page.
 */
export function filterHomeownerBalanceRows<T extends SearchableHomeownerBalanceRow>(rows: T[], rawSearch?: string | null): T[] {
  const normalizedSearch = normalizeSearchText(rawSearch);
  if (!normalizedSearch) return rows;

  const terms = normalizedSearch.split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const haystack = normalizeSearchText([
      row.homeownerName,
      row.accountNumber ?? "",
      `block ${row.block}`,
      `lot ${row.lot}`,
      `block ${row.block} lot ${row.lot}`,
      row.phase ? `phase ${row.phase}` : "",
    ].join(" "));

    return terms.every((term) => haystack.includes(term));
  });
}

export function parseHomeownerBalancePreviewPage(rawPage?: string | null) {
  const page = Number.parseInt(rawPage ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function paginateHomeownerBalanceRows<T>(rows: T[], rawPage?: string | null, pageSize = HOMEOWNER_BALANCE_PREVIEW_PAGE_SIZE) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const page = Math.min(parseHomeownerBalancePreviewPage(rawPage), totalPages);
  const offset = (page - 1) * safePageSize;
  const pageRows = rows.slice(offset, offset + safePageSize);

  return {
    rows: pageRows,
    page,
    pageSize: safePageSize,
    totalPages,
    totalRows: rows.length,
    startIndex: rows.length === 0 ? 0 : offset + 1,
    endIndex: Math.min(offset + safePageSize, rows.length),
  };
}
