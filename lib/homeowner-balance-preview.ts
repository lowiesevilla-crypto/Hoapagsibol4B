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

function compactSearchText(value: unknown) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function parseExplicitPropertySearch(normalizedSearch: string) {
  const tokens = normalizedSearch.split(/\s+/).filter(Boolean);
  const consumed = new Set<number>();
  let block: string | undefined;
  let lot: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if ((token === "block" || token === "blk") && next) {
      block = compactSearchText(next);
      consumed.add(index);
      consumed.add(index + 1);
      index += 1;
      continue;
    }
    if (token === "lot" && next) {
      lot = compactSearchText(next);
      consumed.add(index);
      consumed.add(index + 1);
      index += 1;
      continue;
    }

    const blockMatch = token.match(/^b([a-z0-9]+)$/);
    if (blockMatch?.[1]) {
      block = blockMatch[1];
      consumed.add(index);
      continue;
    }
    const lotMatch = token.match(/^l([a-z0-9]+)$/);
    if (lotMatch?.[1]) {
      lot = lotMatch[1];
      consumed.add(index);
    }
  }

  return {
    block,
    lot,
    residualTerms: tokens.filter((_, index) => !consumed.has(index)),
  };
}

/**
 * Wild/partial search across the complete tenant-scoped report result set.
 * Every normalized search token must appear somewhere in the homeowner name,
 * account number, block, lot, or phase haystack. Filtering intentionally occurs
 * before pagination so a match on any report row can be found regardless of page.
 * A compact haystack is also checked so exact Block/Lot searches still work when
 * user-entered spacing or punctuation differs from the stored property values.
 */
export function filterHomeownerBalanceRows<T extends SearchableHomeownerBalanceRow>(rows: T[], rawSearch?: string | null): T[] {
  const normalizedSearch = normalizeSearchText(rawSearch);
  if (!normalizedSearch) return rows;

  const propertySearch = parseExplicitPropertySearch(normalizedSearch);
  const terms = propertySearch.residualTerms.length ? propertySearch.residualTerms : normalizedSearch.split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const block = String(row.block);
    const lot = String(row.lot);
    if (propertySearch.block && !compactSearchText(block).includes(propertySearch.block)) return false;
    if (propertySearch.lot && !compactSearchText(lot).includes(propertySearch.lot)) return false;

    const haystack = normalizeSearchText([
      row.homeownerName,
      row.accountNumber ?? "",
      `block ${block}`,
      `blk ${block}`,
      `lot ${lot}`,
      `block ${block} lot ${lot}`,
      `blk ${block} lot ${lot}`,
      `block ${block} / lot ${lot}`,
      `${block} / ${lot}`,
      `b${block} l${lot}`,
      row.phase ? `phase ${row.phase}` : "",
    ].join(" "));
    const compactHaystack = compactSearchText(haystack);

    return terms.length === 0 || terms.every((term) => haystack.includes(term) || compactHaystack.includes(compactSearchText(term)));
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
