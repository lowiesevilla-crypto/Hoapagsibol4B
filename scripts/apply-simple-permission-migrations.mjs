import { readFile, writeFile } from "node:fs/promises";

const migrations = new Map([
  ["app/admin/chat/page.tsx", "CHAT_USE"],
  ["app/admin/data/export/route.ts", "DATA_EXPORT"],
  ["app/admin/data/migrations/template/route.ts", "DATA_MIGRATE"],
  ["app/admin/data/template/route.ts", "DATA_IMPORT"],
  ["app/admin/homeowners/[id]/page.tsx", "HOMEOWNERS_MANAGE"],
  ["app/admin/homeowners/[id]/soa/page.tsx", "BILLING_READ"],
  ["app/admin/homeowners/[id]/soa/pdf/route.ts", "BILLING_READ"],
  ["app/admin/homeowners/page.tsx", "HOMEOWNERS_READ"],
  ["app/admin/payments/active/page.tsx", "PAYMENTS_READ"],
  ["app/admin/payments/history/page.tsx", "PAYMENTS_READ"],
  ["app/admin/payments/record/page.tsx", "PAYMENTS_RECORD"],
  ["app/admin/payments/requests/[id]/page.tsx", "PAYMENTS_READ"],
  ["app/admin/payments/requests/page.tsx", "PAYMENTS_READ"],
  ["app/admin/receipts/page.tsx", "PAYMENTS_READ"],
  ["app/admin/reports/dashboard/docx/route.ts", "REPORTS_FINANCIAL"],
  ["app/admin/reports/dashboard/page.tsx", "REPORTS_FINANCIAL"],
  ["app/admin/reports/dashboard/pdf/route.ts", "REPORTS_FINANCIAL"],
  ["app/admin/reports/docx/route.ts", "REPORTS_FINANCIAL"],
  ["app/admin/reports/export/route.ts", "REPORTS_FINANCIAL"],
  ["app/admin/reports/pdf/route.ts", "REPORTS_FINANCIAL"],
  ["app/admin/settings/organization/page.tsx", "SETTINGS_MANAGE"],
  ["app/admin/settings/page.tsx", "SETTINGS_MANAGE"],
  ["app/api/admin/document-walk-in/homeowners/[id]/household-members/route.ts", "DOCUMENTS_MANAGE"],
  ["app/api/admin/document-walk-in/homeowners/route.ts", "DOCUMENTS_MANAGE"],
  ["app/api/auth/passkeys/register/options/route.ts", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/api/auth/passkeys/register/verify/route.ts", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/platform/layout.tsx", "PLATFORM_ACCESS"],
  ["app/portal/announcements/page.tsx", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/portal/chat/page.tsx", "CHAT_USE"],
  ["app/portal/community/page.tsx", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/portal/documents/page.tsx", "DOCUMENTS_READ"],
  ["app/portal/events/page.tsx", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/portal/layout.tsx", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/portal/more/page.tsx", "HOMEOWNER_PORTAL_ACCESS"],
  ["app/portal/requests/page.tsx", "DOCUMENTS_REQUEST"],
  ["lib/actions/bulk-data.ts", "DATA_IMPORT"],
  ["lib/actions/contractors.ts", "PROPERTIES_MANAGE"],
  ["lib/actions/data-migrations.ts", "DATA_MIGRATE"],
  ["lib/actions/exemptions.ts", "BILLING_CONFIGURE"],
  ["lib/actions/expenses.ts", "EXPENSES_MANAGE"],
  ["lib/actions/homeowners.ts", "HOMEOWNERS_MANAGE"],
  ["lib/actions/organization.ts", "SETTINGS_MANAGE"],
  ["lib/actions/payment-requests.ts", "PAYMENTS_REQUEST"],
  ["lib/actions/vehicles.ts", "PROPERTIES_MANAGE"],
]);

function addImport(source, statement) {
  if (source.includes(statement)) return source;
  const directive = source.startsWith('"use server";') ? source.indexOf("\n", source.indexOf("\n") + 1) + 1 : 0;
  return source.slice(0, directive) + statement + "\n" + source.slice(directive);
}

function removeNamedImport(source, modulePath, name) {
  const pattern = new RegExp(`import \\{([^}]*)\\} from ["']${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'];?`, "g");
  return source.replace(pattern, (full, names) => {
    const kept = names.split(",").map((item) => item.trim()).filter(Boolean).filter((item) => item !== name);
    return kept.length ? `import { ${kept.join(", ")} } from "${modulePath}";` : "";
  });
}

for (const [file, permission] of migrations) {
  const before = await readFile(file, "utf8");
  const matches = before.match(/requireUser\(Role\.[A-Z_]+\)/g) ?? [];
  if (!matches.length) throw new Error(`${file}: no legacy requireUser role guard found`);
  let after = before.replace(/requireUser\(Role\.[A-Z_]+\)/g, `requirePermission(Permission.${permission})`);
  after = addImport(after, 'import { requirePermission } from "@/lib/authorization/guards";');
  after = addImport(after, 'import { Permission } from "@/lib/authorization/permissions";');
  if (!after.includes("requireUser(")) after = removeNamedImport(after, "@/lib/auth", "requireUser");
  if (!after.includes("Role.")) after = removeNamedImport(after, "@prisma/client", "Role");
  after = after.replace(/\n{3,}/g, "\n\n");
  if (after === before) throw new Error(`${file}: migration made no changes`);
  await writeFile(file, after);
  console.log(`${file}: ${matches.length} guard(s) -> ${permission}`);
}

console.log(`migrated ${migrations.size} single-purpose authorization surfaces`);
