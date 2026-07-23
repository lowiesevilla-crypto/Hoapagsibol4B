import { readFileSync } from "node:fs";
import { DocumentTemplateVersionStatus } from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { defaultTemplateDefinition, extractPlaceholders, validateTemplateDefinition } from "@/lib/services/document-template-builder";
import { validateNumberingFormat } from "@/lib/services/document-numbering";

async function main() {
  const checks: Array<[string, boolean, string]> = [];
  const validTemplate = defaultTemplateDefinition("Runtime verification");
  checks.push(["complete template validates", validateTemplateDefinition(validTemplate).valid, "default template should be valid"]);
  for (const incomplete of [null, {}, { page: {} }, { blocks: [] }, { sections: {} }]) {
    let didThrow = false;
    let result = { valid: false };
    try { result = validateTemplateDefinition(incomplete); } catch { didThrow = true; }
    checks.push(["incomplete template is defensive", !didThrow && result.valid === false, JSON.stringify(incomplete)]);
  }
  const placeholders = extractPlaceholders("{{tenant.name}} {{unknown.value}}");
  checks.push(["placeholder extraction remains deterministic", placeholders.length === 2 && placeholders[1] === "unknown.value", placeholders.join(",")]);
  checks.push(["valid numbering format is accepted", validateNumberingFormat("{PREFIX}-{YYYY}-{SEQUENCE:6}").valid, "default format"]);
  checks.push(["invalid numbering format is rejected", !validateNumberingFormat("{PREFIX}-{BAD}-{SEQUENCE:6}").valid, "unsupported token"]);

  const tenants = await platformPrisma.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 2 });
  const definitions = await platformPrisma.documentDefinition.findMany({ select: { id: true, tenantId: true, active: true, archivedAt: true, homeownerDownloadEnabled: true, walkInEnabled: true, paymentRequired: true, approvalRequired: true, requiresAdminReview: true, qrEnabled: true, allowRegeneration: true, numberingFormat: true, code: true }, orderBy: { tenantId: "asc" }, take: 10 });
  checks.push(["definition rows are tenant-owned", definitions.every((definition) => tenants.length === 0 || tenants.some((tenant) => tenant.id === definition.tenantId)), "definition tenant ownership"]);
  const capabilitySource = readFileSync("lib/services/document-capabilities.ts", "utf8");
  checks.push(["capability service exposes explicit capability contract", ["supportsHomeownerRequest", "supportsWalkInRequest", "supportsDownload", "supportsRevocation"].every((key) => capabilitySource.includes(key)), "capability contract"]);
  const runtimeFiles = ["document-registry.ts", "document-template-runtime.ts", "document-placeholders.ts", "document-policies.ts", "document-workflows.ts", "document-approvals.ts", "document-numbering-runtime.ts", "document-verification.ts", "document-notifications.ts"];
  for (const file of runtimeFiles) checks.push([`${file} exists`, readFileSync(`lib/services/${file}`, "utf8").length > 0, "runtime service"]);
  const published = await platformPrisma.documentTemplateVersion.findMany({ where: { status: DocumentTemplateVersionStatus.PUBLISHED }, select: { tenantId: true, templateSet: { select: { tenantId: true } } }, take: 50 });
  checks.push(["published templates do not cross tenants", published.every((version) => version.tenantId === version.templateSet.tenantId), "template ownership"]);
  const definitionCounts = await platformPrisma.documentDefinition.groupBy({ by: ["tenantId"], _count: { id: true } });
  checks.push(["tenant definition groups are queryable", definitionCounts.every((group) => Boolean(group.tenantId)), "tenant-first grouping"]);

  let failures = 0;
  for (const [name, passed, detail] of checks) { console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`); if (!passed) failures += 1; }
  await platformPrisma.$disconnect();
  if (failures) throw new Error(`${failures} runtime service checks failed.`);
  console.log(`Runtime service verification passed (${checks.length} checks).`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
