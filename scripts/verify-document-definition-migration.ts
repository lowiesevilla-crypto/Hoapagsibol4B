import { createHash } from "node:crypto";
import { PrismaClient, type DocumentType } from "@prisma/client";

const prisma = new PrismaClient();

type Row = Record<string, unknown>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Row;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(rows: unknown[]) {
  return createHash("sha256").update(stableJson(rows)).digest("hex");
}

function expectedHash(name: string) {
  return process.env[name]?.trim() || null;
}

function assertCondition(condition: unknown, message: string, details?: unknown): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    if (details !== undefined) console.error(stableJson(details));
    process.exitCode = 1;
  }
}

async function collectExpectedPairs() {
  const pairs = new Map<string, { tenantId: string; type: DocumentType }>();
  const add = (tenantId: string, type: DocumentType) => pairs.set(`${tenantId}:${type}`, { tenantId, type });

  const configurations = await prisma.documentTypeConfiguration.findMany({ select: { tenantId: true, type: true } });
  configurations.forEach((row) => add(row.tenantId, row.type));

  const templates = await prisma.documentTemplate.findMany({ select: { tenantId: true, type: true } });
  templates.forEach((row) => add(row.tenantId, row.type));

  const requests = await prisma.documentRequest.findMany({ select: { tenantId: true, type: true } });
  requests.forEach((row) => { if (row.type) add(row.tenantId, row.type); });

  return [...pairs.values()].sort((a, b) => `${a.tenantId}:${a.type}`.localeCompare(`${b.tenantId}:${b.type}`));
}

async function unsafeRelationCounts() {
  const [
    duplicateDefinitions,
    configurationTenantMismatches,
    fieldTenantMismatches,
    templateDefinitionTenantMismatches,
    templateSetTenantMismatches,
    templateVersionTenantMismatches,
    requestTenantMismatches,
    versionTenantMismatches,
  ] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT tenantId, code, COUNT(*) AS count
      FROM DocumentDefinition
      GROUP BY tenantId, code
      HAVING COUNT(*) > 1
    `,
    prisma.$queryRaw<Row[]>`
      SELECT c.id
      FROM DocumentTypeConfiguration c
      JOIN DocumentDefinition d ON d.id = c.definitionId
      WHERE c.definitionId IS NOT NULL AND c.tenantId <> d.tenantId
    `,
    prisma.$queryRaw<Row[]>`
      SELECT f.id
      FROM DocumentFieldConfiguration f
      JOIN DocumentDefinitionField df ON df.id = f.definitionFieldId
      WHERE f.definitionFieldId IS NOT NULL AND f.tenantId <> df.tenantId
    `,
    prisma.$queryRaw<Row[]>`
      SELECT t.id
      FROM DocumentTemplate t
      JOIN DocumentDefinition d ON d.id = t.definitionId
      WHERE t.definitionId IS NOT NULL AND t.tenantId <> d.tenantId
    `,
    prisma.$queryRaw<Row[]>`
      SELECT t.id
      FROM DocumentTemplate t
      JOIN DocumentTemplateSet s ON s.id = t.templateSetId
      WHERE t.templateSetId IS NOT NULL AND t.tenantId <> s.tenantId
    `,
    prisma.$queryRaw<Row[]>`
      SELECT t.id
      FROM DocumentTemplate t
      JOIN DocumentTemplateVersion v ON v.id = t.publishedTemplateVersionId
      WHERE t.publishedTemplateVersionId IS NOT NULL AND t.tenantId <> v.tenantId
    `,
    prisma.$queryRaw<Row[]>`
      SELECT r.id
      FROM DocumentRequest r
      JOIN DocumentDefinition d ON d.id = r.definitionId
      WHERE r.definitionId IS NOT NULL AND r.tenantId <> d.tenantId
    `,
    prisma.$queryRaw<Row[]>`
      SELECT v.id
      FROM DocumentVersion v
      JOIN DocumentDefinition d ON d.id = v.definitionId
      WHERE v.definitionId IS NOT NULL AND v.tenantId <> d.tenantId
    `,
  ]);

  return {
    duplicateDefinitions,
    configurationTenantMismatches,
    fieldTenantMismatches,
    templateDefinitionTenantMismatches,
    templateSetTenantMismatches,
    templateVersionTenantMismatches,
    requestTenantMismatches,
    versionTenantMismatches,
  };
}

async function historicalFingerprints() {
  const [requestContentRows, versionContentRows, requestNumberRows, versionNumberRows] = await Promise.all([
    prisma.documentRequest.findMany({
      where: { generatedContent: { not: null } },
      select: { id: true, tenantId: true, generatedContent: true },
      orderBy: [{ tenantId: "asc" }, { id: "asc" }],
    }),
    prisma.documentVersion.findMany({
      select: { id: true, tenantId: true, requestId: true, version: true, generatedContent: true },
      orderBy: [{ tenantId: "asc" }, { requestId: "asc" }, { version: "asc" }],
    }),
    prisma.documentRequest.findMany({
      where: { documentNumber: { not: null } },
      select: { id: true, tenantId: true, documentNumber: true },
      orderBy: [{ tenantId: "asc" }, { id: "asc" }],
    }),
    prisma.documentVersion.findMany({
      select: { id: true, tenantId: true, requestId: true, version: true, documentNumber: true },
      orderBy: [{ tenantId: "asc" }, { requestId: "asc" }, { version: "asc" }],
    }),
  ]);

  return {
    generatedContent: fingerprint(requestContentRows),
    versionContent: fingerprint(versionContentRows),
    documentNumbers: fingerprint([...requestNumberRows, ...versionNumberRows]),
    generatedRows: requestContentRows.length,
    versionRows: versionContentRows.length,
    numberRows: requestNumberRows.length + versionNumberRows.length,
  };
}

async function main() {
  const expectedPairs = await collectExpectedPairs();
  const [
    definitionCount,
    legacyDefinitionCount,
    linkedConfigurationCount,
    fieldCount,
    linkedFieldCount,
    templateSetCount,
    templateVersionCount,
    linkedTemplateCount,
    requestLinkCount,
    versionLinkCount,
    unsafe,
    fingerprints,
  ] = await Promise.all([
    prisma.documentDefinition.count(),
    prisma.documentDefinition.count({ where: { legacyType: { not: null } } }),
    prisma.documentTypeConfiguration.count({ where: { definitionId: { not: null } } }),
    prisma.documentDefinitionField.count(),
    prisma.documentFieldConfiguration.count({ where: { definitionFieldId: { not: null } } }),
    prisma.documentTemplateSet.count(),
    prisma.documentTemplateVersion.count(),
    prisma.documentTemplate.count({ where: { definitionId: { not: null }, templateSetId: { not: null }, publishedTemplateVersionId: { not: null } } }),
    prisma.documentRequest.count({ where: { definitionId: { not: null } } }),
    prisma.documentVersion.count({ where: { definitionId: { not: null } } }),
    unsafeRelationCounts(),
    historicalFingerprints(),
  ]);

  const expectedGeneratedContentHash = expectedHash("EXPECTED_GENERATED_CONTENT_HASH");
  const expectedVersionContentHash = expectedHash("EXPECTED_VERSION_CONTENT_HASH");
  const expectedDocumentNumberHash = expectedHash("EXPECTED_DOCUMENT_NUMBER_HASH");

  assertCondition(definitionCount >= expectedPairs.length, "definition count is below expected tenant/type pairs", { definitionCount, expectedPairs: expectedPairs.length });
  assertCondition(legacyDefinitionCount === expectedPairs.length, "legacy definition count does not match expected tenant/type pairs", { legacyDefinitionCount, expectedPairs: expectedPairs.length });
  assertCondition(linkedConfigurationCount === await prisma.documentTypeConfiguration.count(), "not all configurations are linked");
  assertCondition(linkedFieldCount === await prisma.documentFieldConfiguration.count(), "not all legacy fields are linked");
  assertCondition(linkedTemplateCount === await prisma.documentTemplate.count(), "not all templates are linked");
  assertCondition(requestLinkCount === await prisma.documentRequest.count(), "not all requests are linked");
  assertCondition(versionLinkCount === await prisma.documentVersion.count(), "not all document versions are linked");

  for (const [key, rows] of Object.entries(unsafe)) {
    assertCondition(Array.isArray(rows) && rows.length === 0, `unsafe relation check failed: ${key}`, rows);
  }

  if (expectedGeneratedContentHash) assertCondition(fingerprints.generatedContent === expectedGeneratedContentHash, "generated request content fingerprint changed", fingerprints);
  if (expectedVersionContentHash) assertCondition(fingerprints.versionContent === expectedVersionContentHash, "generated version content fingerprint changed", fingerprints);
  if (expectedDocumentNumberHash) assertCondition(fingerprints.documentNumbers === expectedDocumentNumberHash, "document number fingerprint changed", fingerprints);

  const result = {
    expectedDefinitionPairs: expectedPairs.length,
    definitionCount,
    legacyDefinitionCount,
    linkedConfigurationCount,
    fieldCount,
    linkedFieldCount,
    templateSetCount,
    templateVersionCount,
    linkedTemplateCount,
    requestLinkCount,
    versionLinkCount,
    unsafe,
    fingerprints,
    passed: process.exitCode !== 1,
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
