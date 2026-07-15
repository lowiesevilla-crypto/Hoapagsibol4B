type HomeownerAccountSource = {
  block: string;
  lot: string;
};

export function homeownerAccountNumber(homeowner: HomeownerAccountSource) {
  return `HOA-B${accountPart(homeowner.block)}-L${accountPart(homeowner.lot)}`;
}

export function homeownerPropertyLabel(homeowner: HomeownerAccountSource) {
  return `Block ${homeowner.block}, Lot ${homeowner.lot}`;
}

function accountPart(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "NA";
}
