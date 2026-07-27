import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentGenerationMode,
  DocumentOrigin,
  DocumentRequestStatus,
  DocumentSubjectType,
  DocumentTemplateVersionStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { readFileSync } from "node:fs";
import { platformPrisma } from "@/lib/db";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";
import { executeDocumentWorkflowAfterSubmission } from "@/lib/services/document-workflow-executor";
import { generateDocument } from "@/lib/services/document-generation";
import { defaultTemplateDefinition } from "@/lib/services/document-template-builder";

type Check = [name: string, passed: boolean, detail: string];

async function main() {
  assertSafeLocalDatabase();
  const runId = `TPL_VERIFY_${Date.now()}`;
  const checks: Check[] = [];
  const requestIds: string[] = [];
  const definitionIds: string[] = [];
  const templateSetIds: string[] = [];

  try {
    const fixture = await loadFixture();
    const admin = await platformPrisma.user.findUniqueOrThrow({ where: { id: fixture.adminId } });
    const context = documentContextFromUser(admin, runId);
    const { definitionId, templateSetId, v9, v10 } = await createPublishedDraftFixture(fixture, runId);
    definitionIds.push(definitionId);
    templateSetIds.push(templateSetId);

    const capturedRequest = await createRequest(fixture, definitionId, runId, v9.id);
    requestIds.push(capturedRequest.id);
    await platformPrisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.update({ where: { id: v9.id }, data: { status: DocumentTemplateVersionStatus.RETIRED } });
      await tx.documentTemplateVersion.update({ where: { id: v10.id }, data: { status: DocumentTemplateVersionStatus.PUBLISHED, publishedAt: new Date(), publishedById: fixture.adminId } });
      await tx.documentDefinition.update({ where: { id: definitionId }, data: { assignedTemplateVersionId: v10.id } });
    });

    const capturedResult = await executeDocumentWorkflowAfterSubmission(context, capturedRequest.id);
    const captured = await requestState(capturedRequest.id);
    const capturedVersion = captured.versions[0];
    add(checks, "existing walk-in request keeps captured v9 after v10 is published", captured.templateVersionIdSnapshot === v9.id && capturedVersion?.templateVersionId === v9.id, `${captured.templateVersionIdSnapshot}/${capturedVersion?.templateVersionId}`);
    add(checks, "official output uses v9 marker", Boolean(captured.generatedContent?.includes(`${runId}_PUBLISHED_V9`) && !captured.generatedContent.includes(`${runId}_DRAFT_V10`)), captured.generatedContent?.slice(0, 120) ?? `${capturedResult.action}/${capturedResult.status}/${capturedResult.failureMessage ?? ""}`);
    add(checks, "walk-in official output has no preview QR warning", captured.generatedContent?.includes("PREVIEW QR") === false && captured.generatedContent?.includes("NOT VALID FOR VERIFICATION") === false, captured.generatedContent?.slice(0, 160) ?? "missing content");
    add(checks, "walk-in official URL uses localhost verification route", capturedResult.verificationUrl?.startsWith("http://localhost:3000/verify/documents/") === true, capturedResult.verificationUrl ?? "missing url");

    const newRequest = await createRequest(fixture, definitionId, runId, null);
    requestIds.push(newRequest.id);
    const freshResult = await executeDocumentWorkflowAfterSubmission(context, newRequest.id);
    const fresh = await requestState(newRequest.id);
    add(checks, "new uncaptured walk-in request captures current published v10 once", fresh.templateVersionIdSnapshot === v10.id && fresh.versions[0]?.templateVersionId === v10.id, `${fresh.templateVersionIdSnapshot}/${fresh.versions[0]?.templateVersionId}`);
    add(checks, "new official output uses v10 marker", Boolean(fresh.generatedContent?.includes(`${runId}_DRAFT_V10`) && !fresh.generatedContent.includes(`${runId}_PUBLISHED_V9`)), fresh.generatedContent?.slice(0, 120) ?? `${freshResult.action}/${freshResult.status}/${freshResult.failureMessage ?? ""}`);
    add(checks, "new official output has no preview QR warning", fresh.generatedContent?.includes("PREVIEW QR") === false && fresh.generatedContent?.includes("NOT VALID FOR VERIFICATION") === false, fresh.generatedContent?.slice(0, 160) ?? "missing content");

    const previewRequest = await createRequest(fixture, definitionId, runId, v9.id);
    requestIds.push(previewRequest.id);
    const preview = await generateDocument(context, previewRequest.id, { mode: DocumentGenerationMode.PREVIEW, correlationId: `${runId}:preview` });
    add(checks, "preview uses captured template version", preview.templateVersionId === v9.id && preview.content?.includes(`${runId}_PUBLISHED_V9`) === true, preview.templateVersionId ?? "missing template");

    const detailPage = readFileSync("app/documents/[id]/page.tsx", "utf8");
    const printPage = readFileSync("app/documents/[id]/print/page.tsx", "utf8");
    const pdfRoute = readFileSync("app/documents/[id]/pdf/route.ts", "utf8");
    add(checks, "document detail separates PDF and HTML downloads", detailPage.includes("/pdf") && detailPage.includes("Download PDF") && detailPage.includes("Download HTML"), "clear export links");
    add(checks, "print uses document-only persisted template-engine HTML", printPage.includes('rendererName === "hoahub-safe-html"') && printPage.includes("renderIssuedDocumentPrintHtml") && !printPage.includes("Official issued document"), "print exact HTML path");
    add(checks, "pdf route renders template-engine documents through issued export service", pdfRoute.includes('rendererName === "hoahub-safe-html"') && pdfRoute.includes("renderIssuedDocumentPdf") && !pdfRoute.includes("PDF export is not available for template-engine documents"), "real PDF export");
  } finally {
    await cleanup({ requestIds, definitionIds, templateSetIds, runId }).catch((error) => console.error("Cleanup failed", error));
  }

  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
  const failures = checks.filter(([, passed]) => !passed);
  await platformPrisma.$disconnect();
  if (failures.length) throw new Error(`${failures.length} approved-template-version check(s) failed.`);
  console.log(`Walk-in approved template version verification passed (${checks.length} checks).`);
}

async function loadFixture() {
  const admin = await platformPrisma.user.findFirst({ where: { active: true, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } }, orderBy: { tenantId: "asc" } });
  if (!admin) throw new Error("A local active admin fixture is required.");
  const homeowner = await platformPrisma.homeownerProfile.findFirst({ where: { tenantId: admin.tenantId, accountNumber: { not: null } }, include: { user: true } });
  if (!homeowner) throw new Error("A local homeowner fixture with account number is required.");
  return { tenantId: admin.tenantId, adminId: admin.id, homeownerId: homeowner.id };
}

async function createPublishedDraftFixture(fixture: Awaited<ReturnType<typeof loadFixture>>, runId: string) {
  const definition = await platformPrisma.documentDefinition.create({ data: {
    tenantId: fixture.tenantId,
    code: `${runId}_RESIDENCY`,
    displayName: `${runId} Certificate of Residency`,
    category: "Verification",
    status: DocumentDefinitionStatus.ACTIVE,
    active: true,
    deliveryMode: DocumentDeliveryMode.INSTANT_DOWNLOAD,
    approvalRequired: false,
    paymentRequired: false,
    paymentBeforeApproval: false,
    allowImmediateDownload: true,
    requiresAdminReview: false,
    homeownerDownloadEnabled: true,
    walkInEnabled: true,
    householdMemberEnabled: true,
    feeAmount: "0.00",
    numberingFormat: "{PREFIX}-{YYYY}-{SEQUENCE:6}",
    createdById: fixture.adminId,
    updatedById: fixture.adminId,
  } });
  const set = await platformPrisma.documentTemplateSet.create({ data: { tenantId: fixture.tenantId, definitionId: definition.id, name: `${runId} Template Set`, createdById: fixture.adminId, updatedById: fixture.adminId } });
  const v9Template = markedTemplate(`${runId}_PUBLISHED_V9`);
  const v10Template = markedTemplate(`${runId}_DRAFT_V10`);
  const v9 = await platformPrisma.documentTemplateVersion.create({ data: { tenantId: fixture.tenantId, templateSetId: set.id, version: 9, status: DocumentTemplateVersionStatus.PUBLISHED, definitionJson: json(v9Template), publishedAt: new Date(), publishedById: fixture.adminId, createdById: fixture.adminId } });
  const v10 = await platformPrisma.documentTemplateVersion.create({ data: { tenantId: fixture.tenantId, templateSetId: set.id, version: 10, status: DocumentTemplateVersionStatus.DRAFT, definitionJson: json(v10Template), createdById: fixture.adminId } });
  await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { assignedTemplateVersionId: v9.id } });
  return { definitionId: definition.id, templateSetId: set.id, v9, v10 };
}

function markedTemplate(marker: string) {
  const template = defaultTemplateDefinition("Approved Template Version Verification");
  template.sections.header = template.sections.header.filter((block) => block.type !== "logo");
  template.sections.body = template.sections.body.map((block, index) => index === 0 ? { ...block, content: `${marker}\n{{subject.fullName}}\n{{document.number}}` } : block);
  template.blocks = [...template.sections.header, ...template.sections.body, ...template.sections.footer];
  return template;
}

async function createRequest(fixture: Awaited<ReturnType<typeof loadFixture>>, definitionId: string, runId: string, templateVersionId: string | null) {
  const homeowner = await platformPrisma.homeownerProfile.findUniqueOrThrow({ where: { id: fixture.homeownerId }, include: { user: true } });
  const template = templateVersionId ? await platformPrisma.documentTemplateVersion.findUniqueOrThrow({ where: { id: templateVersionId } }) : null;
  return platformPrisma.documentRequest.create({ data: {
    tenantId: fixture.tenantId,
    homeownerId: fixture.homeownerId,
    definitionId,
    definitionVersionSnapshot: 1,
    definitionSnapshot: json({ definitionId, runId }),
    templateVersionIdSnapshot: template?.id,
    templateVersionSnapshot: template?.version,
    templateDefinitionSnapshot: template ? json(template.definitionJson) : undefined,
    subjectType: DocumentSubjectType.SELF,
    subjectSnapshot: json({ fullName: homeowner.user.name, relationship: "Homeowner", address: homeowner.address, homeownerName: homeowner.user.name, propertyAddress: homeowner.address, block: homeowner.block, lot: homeowner.lot, accountNumber: homeowner.accountNumber, accountLabel: `Block ${homeowner.block}, Lot ${homeowner.lot}` }),
    requestDataSnapshot: json({ fields: { purpose: `${runId} template verification`, remarks: runId } }),
    deliveryModeSnapshot: DocumentDeliveryMode.INSTANT_DOWNLOAD,
    approvalRequiredSnapshot: false,
    paymentRequiredSnapshot: false,
    feeAmountSnapshot: "0.00",
    origin: DocumentOrigin.ADMIN,
    initiatedById: fixture.adminId,
    status: DocumentRequestStatus.SUBMITTED,
    purpose: `${runId} template verification`,
    remarks: runId,
    validityDate: new Date(Date.now() + 86_400_000 * 30),
  } });
}

async function requestState(id: string) {
  return platformPrisma.documentRequest.findUniqueOrThrow({ where: { id }, include: { versions: { orderBy: { version: "desc" } } } });
}

async function cleanup(input: { requestIds: string[]; definitionIds: string[]; templateSetIds: string[]; runId: string }) {
  await platformPrisma.documentGenerationAttempt.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentVerificationToken.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentVersion.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentRequestHistory.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentRequest.deleteMany({ where: { id: { in: input.requestIds } } });
  await platformPrisma.documentDefinitionCounter.deleteMany({ where: { definitionId: { in: input.definitionIds } } });
  await platformPrisma.documentDefinition.updateMany({ where: { id: { in: input.definitionIds } }, data: { assignedTemplateVersionId: null } });
  await platformPrisma.documentTemplateVersion.deleteMany({ where: { templateSetId: { in: input.templateSetIds } } });
  await platformPrisma.documentTemplateSet.deleteMany({ where: { id: { in: input.templateSetIds } } });
  await platformPrisma.documentDefinition.deleteMany({ where: { id: { in: input.definitionIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { OR: [{ correlationId: { startsWith: input.runId } }, { entityId: { in: [...input.requestIds, ...input.definitionIds] } }] } });
  await platformPrisma.notificationLog.deleteMany({ where: { entityId: { in: input.requestIds } } });
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertSafeLocalDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Template-version verification is disabled in production.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Template-version verification requires DATABASE_URL.");
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase()) || url.pathname.replace(/^\//, "") !== "hoahub_prodclone_local") {
    throw new Error("Template-version verification may run only against hoahub_prodclone_local on a local MySQL host.");
  }
}

main().catch(async (error) => {
  console.error(error);
  await platformPrisma.$disconnect();
  process.exit(1);
});
