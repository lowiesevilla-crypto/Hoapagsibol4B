from pathlib import Path
import re


def write(path: str, text: str) -> None:
    Path(path).write_text(text if text.endswith("\n") else text + "\n")


# Prisma schema: PayerType is the single authority.
p = Path("prisma/schema.prisma")
s = p.read_text()
s, enum_count = re.subn(
    r"enum PayerType \{\s*HOMEOWNER\s*CONTRACTOR\s*(?:RENTER\s*OTHER\s*)?\}",
    "enum PayerType {\n  HOMEOWNER\n  CONTRACTOR\n  RENTER\n  OTHER\n}",
    s,
    count=1,
)
if enum_count != 1:
    raise SystemExit(f"PayerType enum replacement count={enum_count}")
if "payerName       String?" not in s:
    if "  payerType       PayerType\n  homeownerId     String?" not in s:
        raise SystemExit("Collection payerType anchor not found")
    s = s.replace(
        "  payerType       PayerType\n  homeownerId     String?",
        "  payerType       PayerType\n  payerName       String?            @db.VarChar(191)\n  homeownerId     String?",
        1,
    )
if "@@index([tenantId, payerType, collectionDate])" not in s:
    if "  @@index([contractorId, collectionDate])\n  @@index([refundable, refundStatus])" not in s:
        raise SystemExit("Collection index anchor not found")
    s = s.replace(
        "  @@index([contractorId, collectionDate])\n  @@index([refundable, refundStatus])",
        "  @@index([contractorId, collectionDate])\n  @@index([tenantId, payerType, collectionDate])\n  @@index([refundable, refundStatus])",
        1,
    )
if "payerCategory" in s:
    raise SystemExit("payerCategory must not exist in Prisma schema")
p.write_text(s)

# Validation.
p = Path("lib/validation.ts")
s = p.read_text()
s = s.replace(
    '  payerType: z.enum(["HOMEOWNER", "CONTRACTOR"]),\n  homeownerId: z.string().optional(),',
    '  payerType: z.enum(["HOMEOWNER", "CONTRACTOR", "RENTER", "OTHER"]),\n  payerName: z.string().trim().max(150).optional(),\n  homeownerId: z.string().optional(),',
    1,
)
if 'payerType: z.enum(["HOMEOWNER", "CONTRACTOR", "RENTER", "OTHER"])' not in s:
    raise SystemExit("collectionSchema payerType was not corrected")
p.write_text(s)

# Server action: replace whole recordCollectionAction and remove compatibility helper.
p = Path("lib/actions/collections.ts")
s = p.read_text().replace('import { isCollectionPayerCategory, isExternalCollectionPayer } from "@/lib/collection-payer";\n', '')
replacement = '''export async function recordCollectionAction(formData: FormData) {
  const admin = await requirePermissions([
    Permission.COLLECTIONS_RECORD,
    Permission.RECEIPTS_ISSUE,
  ]);
  const parsed = collectionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid collection details.");
  const data = parsed.data;
  const refundable = refundableTypes.has(data.type);
  const externalPayer = data.payerType === PayerType.RENTER || data.payerType === PayerType.OTHER;
  const payerName = data.payerName?.trim() ?? "";

  if (data.type === CollectionType.CONSTRUCTION_BOND && data.payerType !== PayerType.HOMEOWNER) {
    throw new Error("A construction bond must be assigned to a homeowner.");
  }
  if (data.type === CollectionType.CONTRACTOR_BOND && data.payerType !== PayerType.CONTRACTOR) {
    throw new Error("A contractor bond must be assigned to a contractor profile.");
  }
  if (externalPayer && data.type !== CollectionType.OTHER) {
    throw new Error("Renter and other payers are available only for Other income collections.");
  }
  if (data.type === CollectionType.OTHER && !data.description) throw new Error("Enter a name for the other collection type.");
  if (externalPayer && !payerName) throw new Error("Enter the payer name.");
  if (data.payerType === PayerType.HOMEOWNER && !data.homeownerId) throw new Error("Select a homeowner.");
  if (data.payerType === PayerType.CONTRACTOR && !data.contractorId) throw new Error("Select a contractor.");

  if (data.payerType === PayerType.HOMEOWNER) {
    const exists = await prisma.homeownerProfile.count({ where: { id: data.homeownerId, tenantId: admin.tenantId } });
    if (!exists) throw new Error("Homeowner not found.");
  } else if (data.payerType === PayerType.CONTRACTOR) {
    const exists = await prisma.contractorProfile.count({ where: { id: data.contractorId, tenantId: admin.tenantId } });
    if (!exists) throw new Error("Contractor not found.");
  }

  await prisma.$transaction(async (tx) => {
    const collectionDate = new Date(`${data.collectionDate}T00:00:00.000Z`);
    const series = collectionReceiptSeries(data.type);
    const receiptNumber = await allocateReceiptNumber(tx as unknown as Prisma.TransactionClient, admin.tenantId, collectionDate, series);
    const collection = await tx.collection.create({ data: {
      type: data.type,
      description: data.description || null,
      payerType: data.payerType,
      payerName: externalPayer ? payerName : null,
      homeownerId: data.payerType === PayerType.HOMEOWNER ? data.homeownerId : null,
      contractorId: data.payerType === PayerType.CONTRACTOR ? data.contractorId : null,
      amount: data.amount,
      collectionDate,
      method: data.method,
      referenceNumber: data.referenceNumber || null,
      receiptNumber,
      remarks: data.remarks || null,
      refundable,
      refundStatus: refundable ? RefundStatus.HELD : RefundStatus.NOT_APPLICABLE,
      createdById: admin.id,
    } });
    await tx.auditLog.create({ data: {
      actorId: admin.id,
      module: "RECEIPTS",
      action: `GENERATE_${series}_RECEIPT`,
      entityType: "Collection",
      entityId: collection.id,
      metadata: { receiptNumber, amount: data.amount, payerType: data.payerType, payerName: externalPayer ? payerName : null },
    } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidateCollectionPages();
  redirect("/admin/collections?success=recorded");
}

export async function recordBondRefundAction'''
s, n = re.subn(
    r'export async function recordCollectionAction\(formData: FormData\) \{[\s\S]*?\n\}\n\nexport async function recordBondRefundAction',
    replacement,
    s,
    count=1,
)
if n != 1:
    raise SystemExit(f"recordCollectionAction replacement count={n}")
if any(x in s for x in ["requestedPayerType", "legacyPayerType", "payerCategory", "$executeRaw", "collection-payer"]):
    raise SystemExit("legacy payer compatibility code remains in collection action")
p.write_text(s)

# Collections admin page.
p = Path("app/admin/collections/page.tsx")
s = p.read_text()
s = s.replace('import { requireUser } from "@/lib/auth";\n', '')
s = s.replace('import { getCollectionPayerMetadata } from "@/lib/collection-payer";\n', '')
s = s.replace('  const user = await requireUser();\n', '')
s = re.sub(r'  const payerMetadata = await getCollectionPayerMetadata\([^\n]+\);\n', '', s)
s, n = re.subn(
    r'  const payerInfo = \(item: \(typeof collections\)\[number\]\) => \{[\s\S]*?\n  \};',
    '  const payerInfo = (item: (typeof collections)[number]) => ({\n    name: item.payerName || item.homeowner?.user.name || item.contractor?.companyName || "Unknown payer",\n    category: item.payerType,\n  });',
    s,
    count=1,
)
if n != 1:
    raise SystemExit(f"collections payerInfo replacement count={n}")
if any(x in s for x in ["payerMetadata", "payerCategory", "collection-payer"]):
    raise SystemExit("legacy payer metadata remains in collections page")
p.write_text(s)

# HTML receipt.
p = Path("app/receipts/[kind]/[id]/page.tsx")
s = p.read_text()
s = s.replace('import { getSingleCollectionPayerMetadata } from "@/lib/collection-payer";\n', '')
s = s.replace('      const metadata = await getSingleCollectionPayerMetadata(user.tenantId, item.id);\n', '')
s = s.replace('      const category = metadata?.payerCategory ?? item.payerType;\n', '      const category = item.payerType;\n')
s = s.replace('payer: external ? metadata?.payerName || "Unknown payer" : item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",', 'payer: external ? item.payerName || "Unknown payer" : item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",')
if any(x in s for x in ["payerCategory", "collection-payer", "metadata?.payerName"]):
    raise SystemExit("legacy payer metadata remains in HTML receipt")
p.write_text(s)

# PDF receipt.
p = Path("app/receipts/[kind]/[id]/pdf/route.ts")
s = p.read_text()
s = s.replace('import { getSingleCollectionPayerMetadata } from "@/lib/collection-payer";\n', '')
s = s.replace('    const metadata = await getSingleCollectionPayerMetadata(user.tenantId, item.id);\n', '')
s = s.replace('    const category = metadata?.payerCategory ?? item.payerType;\n', '    const category = item.payerType;\n')
s = s.replace('payer: external ? metadata?.payerName || "Unknown payer" : item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",', 'payer: external ? item.payerName || "Unknown payer" : item.homeowner?.user.name ?? item.contractor?.companyName ?? "Unknown payer",')
if any(x in s for x in ["payerCategory", "collection-payer", "metadata?.payerName"]):
    raise SystemExit("legacy payer metadata remains in PDF receipt")
p.write_text(s)

# Finance export.
p = Path("app/admin/reports/export/route.ts")
s = p.read_text()
s = s.replace('import { getCollectionPayerMetadata } from "@/lib/collection-payer";\n', '')
s = s.replace('  const user = await requireUser(Role.ADMIN);\n', '  await requireUser(Role.ADMIN);\n')
s, n = re.subn(
    r'  const payerMetadata = await getCollectionPayerMetadata[\s\S]*?  const header =',
    '  const collectionPayerName = (item: (typeof collections)[number]) => item.payerName || item.homeowner?.user.name || item.contractor?.companyName || "Unknown";\n  const header =',
    s,
    count=1,
)
if n != 1:
    raise SystemExit(f"finance export payer metadata replacement count={n}")
if any(x in s for x in ["payerMetadata", "payerCategory", "collection-payer"]):
    raise SystemExit("legacy payer metadata remains in finance export")
p.write_text(s)

# Migration.
write("prisma/migrations/20260821234500_flexible_collection_payers/migration.sql", """-- Extend Collection payer authority for renter and other external payers.
-- Existing HOMEOWNER/CONTRACTOR values remain valid and unchanged.
ALTER TABLE `Collection`
  MODIFY COLUMN `payerType` ENUM('HOMEOWNER','CONTRACTOR','RENTER','OTHER') NOT NULL,
  ADD COLUMN `payerName` VARCHAR(191) NULL AFTER `payerType`;

CREATE INDEX `Collection_tenantId_payerType_collectionDate_idx`
  ON `Collection`(`tenantId`, `payerType`, `collectionDate`);
""")

# Regression contract.
write("tests/unit/flexible-collection-payers-surface.test.ts", r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaPath = new URL("../../prisma/schema.prisma", import.meta.url);
const validationPath = new URL("../../lib/validation.ts", import.meta.url);
const formPath = new URL("../../components/collection-form.tsx", import.meta.url);
const actionPath = new URL("../../lib/actions/collections.ts", import.meta.url);
const pagePath = new URL("../../app/admin/collections/page.tsx", import.meta.url);
const receiptPath = new URL("../../app/receipts/[kind]/[id]/page.tsx", import.meta.url);
const pdfPath = new URL("../../app/receipts/[kind]/[id]/pdf/route.ts", import.meta.url);
const exportPath = new URL("../../app/admin/reports/export/route.ts", import.meta.url);
const migrationPath = new URL("../../prisma/migrations/20260821234500_flexible_collection_payers/migration.sql", import.meta.url);

test("Prisma PayerType is the single flexible payer authority", async () => {
  const [schema, validation, migration] = await Promise.all([readFile(schemaPath, "utf8"), readFile(validationPath, "utf8"), readFile(migrationPath, "utf8")]);
  assert.match(schema, /enum PayerType \{[\s\S]*HOMEOWNER[\s\S]*CONTRACTOR[\s\S]*RENTER[\s\S]*OTHER[\s\S]*\}/);
  assert.match(schema, /payerName\s+String\?/);
  assert.doesNotMatch(schema, /payerCategory/);
  assert.match(validation, /payerType: z\.enum\(\["HOMEOWNER", "CONTRACTOR", "RENTER", "OTHER"\]\)/);
  assert.match(validation, /payerName: z\.string\(\)\.trim\(\)\.max\(150\)\.optional\(\)/);
  assert.match(migration, /ENUM\('HOMEOWNER','CONTRACTOR','RENTER','OTHER'\)/);
  assert.match(migration, /payerName/);
  assert.doesNotMatch(migration, /payerCategory/);
});

test("External payers are Other-income-only and bonds stay profile-bound", async () => {
  const [form, action] = await Promise.all([readFile(formPath, "utf8"), readFile(actionPath, "utf8")]);
  assert.match(form, /<option value="RENTER">Renter<\/option>/);
  assert.match(form, /<option value="OTHER">Others<\/option>/);
  assert.match(form, /name="payerName"/);
  assert.match(action, /PayerType\.RENTER/);
  assert.match(action, /PayerType\.OTHER/);
  assert.match(action, /CONSTRUCTION_BOND[\s\S]*PayerType\.HOMEOWNER/);
  assert.match(action, /CONTRACTOR_BOND[\s\S]*PayerType\.CONTRACTOR/);
  assert.doesNotMatch(action, /payerCategory|\$executeRaw|legacyPayerType|requestedPayerType/);
});

test("External payer identity reaches history receipts audit and finance export", async () => {
  const [action, page, receipt, pdf, report] = await Promise.all([readFile(actionPath, "utf8"), readFile(pagePath, "utf8"), readFile(receiptPath, "utf8"), readFile(pdfPath, "utf8"), readFile(exportPath, "utf8")]);
  assert.match(action, /payerName: externalPayer \? payerName : null/);
  assert.match(action, /payerType: data\.payerType/);
  assert.match(page, /item\.payerName/);
  assert.match(receipt, /item\.payerName/);
  assert.match(pdf, /item\.payerName/);
  assert.match(report, /item\.payerName/);
  for (const source of [page, receipt, pdf, report]) assert.doesNotMatch(source, /payerCategory|collection-payer/);
});
''')

# Agent contract.
p = Path("Agent.md")
s = p.read_text()
start = s.find("## Flexible Collection Payers — PR #137")
end = s.find("\n## Hostinger Production Deployment Model", start)
if start < 0 or end < 0:
    raise SystemExit("Agent.md PR137 contract block not found")
block = '''## Flexible Collection Payers — PR #137

- Prisma `PayerType` is the single payer authority and supports `HOMEOWNER`, `CONTRACTOR`, `RENTER`, and `OTHER`. Do not introduce a parallel payer category column or raw-SQL compatibility authority.
- `Collection.payerName` is nullable and stores the bounded free-text payer identity only for `RENTER` and `OTHER`; do not fabricate Homeowner, User, or Contractor records for external payers.
- External payer types are allowed only for `CollectionType.OTHER`. Construction Bond remains Homeowner-only and Contractor Bond remains Contractor-only.
- Existing homeowner/contractor selectors, tenant-scoped existence checks, receipt numbering, finance treatment, bond liabilities, refunds, forfeitures, and audit controls remain unchanged.
- Collection history/search, HTML receipt, PDF receipt, finance CSV export, and receipt audit metadata must display/preserve the external payer name and first-class payer type.
- Migration `20260821234500_flexible_collection_payers` expands the existing MySQL `payerType` enum in place and adds nullable `payerName`, preserving existing HOMEOWNER/CONTRACTOR rows.
- `prisma/schema.prisma`, `lib/validation.ts`, `components/collection-form.tsx`, `lib/actions/collections.ts`, `app/admin/collections/page.tsx`, receipt HTML/PDF routes, finance export, migration, and `tests/unit/flexible-collection-payers-surface.test.ts` are the principal regression surface.
'''
p.write_text(s[:start] + block + s[end:])

# Final branch must not retain compatibility/helper/correction artifacts.
for path in [
    "lib/collection-payer.ts",
    ".github/pr137-domain-model-correction.trigger",
    ".github/workflows/pr137-domain-model-correction.yml",
    ".github/workflows/pr137-domain-model-correction-v2.yml",
    "scripts/pr137-correct.py",
]:
    q = Path(path)
    if q.exists():
        q.unlink()
