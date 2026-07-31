import "./register-server-only-shim.cjs";

import { allowedDocumentPlaceholders } from "@/lib/services/document-template-builder";
import { resolvePassRequestTemplateValues } from "@/lib/services/document-generation";
import { resolveDocumentPlaceholders, validateDocumentPlaceholders } from "@/lib/services/document-placeholders";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const approvedTokens = [
  "request.passType",
  "request.scheduledDate",
  "request.startTime",
  "request.endTime",
  "request.driverName",
  "request.representativeName",
  "request.vehicleDetails",
  "request.destination",
  "request.movingCompany",
  "request.serviceProvider",
  "request.itemsSummary",
  "request.approvalDate",
] as const;

for (const token of approvedTokens) assert(allowedDocumentPlaceholders.includes(token), `${token} is allowlisted`);
assert(!allowedDocumentPlaceholders.includes("request.vehicleType" as never), "vehicle type token is not added because no separate stored field exists");
assert(!allowedDocumentPlaceholders.includes("request.plateNumber" as never), "plate number token is not added because no separate stored field exists");

const validation = validateDocumentPlaceholders(approvedTokens.map((token) => `{{${token}}}`).join(" "));
assert(validation.valid, "approved pass request tokens validate");

const mapped = resolvePassRequestTemplateValues({
  requestDataSnapshot: { fields: { startTime: "07:00", representativeName: "Submitted Driver", vehicleDetails: "Submitted truck", destination: "Submitted gate" } },
  reviewedDataSnapshot: { fields: { startTime: "08:00", scheduledDate: "2026-07-31", passType: "MOVE_IN", contractorDetails: "Reviewed Movers", items: [{ quantity: 2, description: "<Office chairs>" }] } },
  representativeName: "Column Driver",
  vehicleDetails: "Column truck",
  approvedAt: new Date("2026-07-31T10:30:00.000Z"),
});

assert(mapped.startTime === "08:00", "reviewed snapshot wins over submitted snapshot and column values");
assert(mapped.scheduledDate.includes("2026") || mapped.scheduledDate.includes("July"), "scheduled date resolves from stored date value");
assert(mapped.driverName === "Submitted Driver", "driver name resolves from representativeName when reviewed value is absent");
assert(mapped.vehicleDetails === "Submitted truck", "vehicle details resolve from submitted value before column fallback");
assert(mapped.destination === "Submitted gate", "destination resolves from stored request snapshot field");
assert(mapped.movingCompany === "Reviewed Movers" && mapped.serviceProvider === "Reviewed Movers", "moving company and service provider resolve from contractor details");
assert(!mapped.itemsSummary.includes("<") && !mapped.itemsSummary.includes(">") && mapped.itemsSummary.includes("Office chairs"), "items summary is printable plain text");
assert(!mapped.itemsSummary.includes("Submitted"), "items summary uses reviewed items instead of merging submitted items");
assert(Boolean(mapped.approvalDate), "approval date resolves from trusted approvedAt timestamp");

const partyFallback = resolvePassRequestTemplateValues({
  requestDataSnapshot: { fields: { partyName: "Authorized Party" } },
});
assert(partyFallback.representativeName === "Authorized Party" && partyFallback.driverName === "Authorized Party", "representative and driver tokens fall back to stored authorized party");

const overflow = resolvePassRequestTemplateValues({
  reviewedDataSnapshot: { fields: { items: Array.from({ length: 20 }, (_, index) => ({ quantity: 1, description: `Very long approved item description ${index} `.repeat(6) })) } },
});
assert(overflow.itemsSummary === "See approved attachment", "long item summary uses approved attachment notice");

const resolved = resolveDocumentPlaceholders("{{request.passType}} {{request.itemsSummary}}", { request: mapped });
assert(resolved.resolvedContent.includes("MOVE IN") && resolved.resolvedContent.includes("Office chairs"), "new request tokens resolve through existing placeholder engine");

console.log("Pass template token verification passed.");
