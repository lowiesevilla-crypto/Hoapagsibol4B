type HomeownerAccountSource = {
  accountNumber?: string | null;
  block?: string | null;
  lot?: string | null;
};

export function homeownerAccountNumber(homeowner: HomeownerAccountSource) {
  return canonicalAccountNumber(homeowner.accountNumber) || "UNASSIGNED";
}

export function homeownerPropertyLabel(homeowner: HomeownerAccountSource) {
  return `Block ${accountPart(homeowner.block)}, Lot ${accountPart(homeowner.lot)}`;
}

export function legacyHomeownerPropertyAccountReference(homeowner: HomeownerAccountSource) {
  return `HOA-B${accountPart(homeowner.block)}-L${accountPart(homeowner.lot)}`;
}

function canonicalAccountNumber(value: unknown) {
  return typeof value === "string" && /^[1-9][0-9]{10}$/.test(value) ? value : null;
}

function accountPart(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "NA";
}
