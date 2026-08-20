import type { Prisma } from "@prisma/client";

export type ParsedHomeownerSearch = {
  block?: string;
  lot?: string;
  terms: string[];
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._#:-]+/g, " ")
    .trim();
}

/**
 * Parses common HOA property lookup phrases while preserving ordinary directory
 * search. Examples: "block 1 lot 2", "blk 1 lot 2", "block:1 lot:2".
 */
export function parseHomeownerSearch(raw: string): ParsedHomeownerSearch {
  let normalized = normalizeSearch(raw);
  let block: string | undefined;
  let lot: string | undefined;

  normalized = normalized.replace(/\b(?:block|blk)\s*[:#-]?\s*([a-z0-9][a-z0-9._-]*)\b/g, (_match, value: string) => {
    block ??= value;
    return " ";
  });
  normalized = normalized.replace(/\blot\s*[:#-]?\s*([a-z0-9][a-z0-9._-]*)\b/g, (_match, value: string) => {
    lot ??= value;
    return " ";
  });

  const terms = normalized.split(/\s+/).map((term) => term.trim()).filter(Boolean);
  return { ...(block ? { block } : {}), ...(lot ? { lot } : {}), terms };
}

export function homeownerSearchWhere(raw: string): Prisma.HomeownerProfileWhereInput {
  const parsed = parseHomeownerSearch(raw);
  const clauses: Prisma.HomeownerProfileWhereInput[] = [];

  if (parsed.block) clauses.push({ block: { contains: parsed.block } });
  if (parsed.lot) clauses.push({ lot: { contains: parsed.lot } });

  for (const term of parsed.terms) {
    clauses.push({
      OR: [
        { user: { name: { contains: term } } },
        { user: { email: { contains: term } } },
        { accountNumber: { contains: term.replace(/\D/g, "") || term } },
        { block: { contains: term } },
        { lot: { contains: term } },
      ],
    });
  }

  return clauses.length ? { AND: clauses } : {};
}
