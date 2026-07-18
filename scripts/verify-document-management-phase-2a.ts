import fs from "node:fs/promises";
import { PrismaClient, DocumentDefinitionStatus } from "@prisma/client";

const prisma = new PrismaClient();

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function main() {
  const [definitions, hub, legacy] = await Promise.all([
    prisma.documentDefinition.findMany({ include: { assignedTemplateVersion: { include: { templateSet: true } }, fields: { where: { active: true } } } }),
    fs.readFile("app/admin/documents/page.tsx", "utf8"),
    fs.readFile("app/admin/document-templates/page.tsx", "utf8"),
  ]);
  const keys = new Set<string>();
  for (const definition of definitions) {
    const key = `${definition.tenantId}:${definition.code}`;
    assertCondition(!keys.has(key), `duplicate tenant/code ${key}`);
    keys.add(key);
    if (definition.assignedTemplateVersion) {
      assertCondition(definition.assignedTemplateVersion.tenantId === definition.tenantId, `cross-tenant assigned template for ${definition.code}`);
      assertCondition(definition.assignedTemplateVersion.templateSet.tenantId === definition.tenantId, `cross-tenant template set for ${definition.code}`);
      assertCondition(definition.assignedTemplateVersion.templateSet.definitionId === definition.id, `template definition mismatch for ${definition.code}`);
    }
    if (definition.walkInEnabled) {
      assertCondition(definition.status === DocumentDefinitionStatus.ACTIVE && definition.active && !definition.archivedAt, `inactive walk-in definition ${definition.code}`);
      assertCondition(Boolean(definition.assignedTemplateVersion && definition.assignedTemplateVersion.status === "PUBLISHED"), `walk-in definition without a published template ${definition.code}`);
    }
  }
  assertCondition(hub.includes("Document Definition Diagnostics"), "diagnostics panel is missing from the hub");
  assertCondition(!hub.includes("Expected document type inventory"), "duplicate inventory cards remain on the normal hub");
  assertCondition(hub.includes("Walk-In availability"), "walk-in availability is missing from the catalog table");
  assertCondition(legacy.includes('redirect("/admin/documents?section=templates&notice=legacy-templates")'), "legacy template redirect is not preserved");
  console.log(`PASS: Phase 2A document management checks verified ${definitions.length} tenant-scoped definitions, template ownership, walk-in requestability, diagnostics, and legacy redirect.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
