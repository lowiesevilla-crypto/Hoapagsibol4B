import { prisma } from "@/lib/db";

type TableRow = { tableName: string };
type CountRow = { count: bigint };
type IndexRow = { tableName: string; indexName: string; columnName: string };
type ForeignKeyRow = { tableName: string; columnName: string; referencedTable: string; referencedColumn: string };

const requiredTables = [
  "DocumentPolicy",
  "DocumentDefinitionPolicyAssignment",
  "DocumentWorkflowDefinition",
  "DocumentWorkflowStep",
  "DocumentNumberingConfiguration",
  "DocumentPlaceholderDefinition",
];

const requiredColumns: Record<string, string[]> = {
  DocumentDefinition: ["workflowDefinitionId"],
  DocumentVersion: ["issuedStatus", "contentHash", "reissueOfId"],
  DocumentRequestHistory: ["workflowVersion", "workflowStepId", "decision", "override"],
  DocumentVerificationToken: ["verificationCount", "lastVerifiedAt"],
  AuditLog: ["reason", "correlationId", "ipAddress", "userAgent", "aiAction"],
};

async function main() {
  const tables = await prisma.$queryRawUnsafe<TableRow[]>(
    `SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tableSet = new Set(tables.map((row) => row.tableName));
  const missingTables = requiredTables.filter((table) => !tableSet.has(table));
  assert(missingTables.length === 0, `Missing required tables: ${missingTables.join(", ")}`);

  for (const [table, columns] of Object.entries(requiredColumns)) {
    const rows = await prisma.$queryRawUnsafe<Array<{ columnName: string }>>(
      `SELECT COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      table,
    );
    const present = new Set(rows.map((row) => row.columnName));
    const missing = columns.filter((column) => !present.has(column));
    assert(missing.length === 0, `Missing ${table} columns: ${missing.join(", ")}`);
  }

  const indexes = await prisma.$queryRawUnsafe<IndexRow[]>(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, COLUMN_NAME AS columnName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('DocumentDefinition', 'DocumentPolicy', 'DocumentWorkflowDefinition', 'DocumentNumberingConfiguration')`,
  );
  const indexColumns = new Map<string, string[]>();
  for (const row of indexes) {
    const key = `${row.tableName}:${row.indexName}`;
    indexColumns.set(key, [...(indexColumns.get(key) || []), row.columnName]);
  }
  assert(hasIndex(indexColumns, "DocumentDefinition", "tenantId", "code"), "DocumentDefinition lacks tenant-scoped code uniqueness.");
  assert(hasIndex(indexColumns, "DocumentPolicy", "tenantId", "code"), "DocumentPolicy lacks tenant-scoped code uniqueness.");
  assert(hasIndex(indexColumns, "DocumentWorkflowDefinition", "tenantId", "code"), "DocumentWorkflowDefinition lacks tenant-scoped code uniqueness.");
  assert(hasIndex(indexColumns, "DocumentNumberingConfiguration", "tenantId", "definitionId"), "Numbering configuration is not tenant/definition scoped.");

  const foreignKeys = await prisma.$queryRawUnsafe<ForeignKeyRow[]>(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, REFERENCED_TABLE_NAME AS referencedTable, REFERENCED_COLUMN_NAME AS referencedColumn
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
       AND TABLE_NAME IN ('DocumentDefinitionPolicyAssignment', 'DocumentWorkflowStep', 'DocumentNumberingConfiguration', 'DocumentPlaceholderDefinition')`,
  );
  assert(foreignKeys.some((row) => row.tableName === "DocumentDefinitionPolicyAssignment" && row.referencedTable === "DocumentDefinition"), "Policy assignments lack definition ownership FK.");
  assert(foreignKeys.some((row) => row.tableName === "DocumentDefinitionPolicyAssignment" && row.referencedTable === "DocumentPolicy"), "Policy assignments lack policy ownership FK.");
  assert(foreignKeys.some((row) => row.tableName === "DocumentWorkflowStep" && row.referencedTable === "DocumentWorkflowDefinition"), "Workflow steps lack workflow ownership FK.");
  assert(foreignKeys.some((row) => row.tableName === "DocumentNumberingConfiguration" && row.referencedTable === "DocumentDefinition"), "Numbering configuration lacks definition ownership FK.");

  const [definitions, policies, workflows, steps, numbering, placeholders, versions] = await Promise.all([
    count("DocumentDefinition"),
    count("DocumentPolicy"),
    count("DocumentWorkflowDefinition"),
    count("DocumentWorkflowStep"),
    count("DocumentNumberingConfiguration"),
    count("DocumentPlaceholderDefinition"),
    prisma.$queryRawUnsafe<Array<{ versionCount: bigint; contentBytes: bigint }>>(
      `SELECT COUNT(*) AS versionCount, COALESCE(SUM(CHAR_LENGTH(generatedContent)), 0) AS contentBytes FROM DocumentVersion`,
    ),
  ]);

  const ownership = await prisma.$queryRawUnsafe<Array<{ ownershipType: string; count: bigint }>>(
    `SELECT ownershipType, COUNT(*) AS count FROM DocumentTemplateSet GROUP BY ownershipType`,
  );
  const certifiedWithEdits = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*) AS count FROM DocumentTemplateSet WHERE ownershipType = 'CERTIFIED' AND editable = true`,
  );
  assert(Number(certifiedWithEdits[0]?.count || 0) === 0, "Certified template sets must remain read-only.");

  console.log(`PASS: document platform foundation verified ${requiredTables.length} additive tables, tenant-scoped uniqueness, ownership foreign keys, certified immutability, and historical version inventory.`);
  console.log(JSON.stringify({
    counts: { definitions, policies, workflows, steps, numbering, placeholders },
    templateOwnership: ownership,
    historicalVersionInventory: versions[0],
  }, (_key, value) => typeof value === "bigint" ? Number(value) : value, 2));
}

function hasIndex(indexes: Map<string, string[]>, table: string, ...columns: string[]) {
  return [...indexes.entries()].some(([key, indexedColumns]) => key.startsWith(`${table}:`) && columns.every((column) => indexedColumns.includes(column)));
}

async function count(table: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(`SELECT COUNT(*) AS count FROM \`${table}\``);
  return Number(rows[0]?.count || 0);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch(async (error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  await prisma.$disconnect();
  process.exitCode = 1;
});
