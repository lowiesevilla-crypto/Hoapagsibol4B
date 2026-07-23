import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentGenerationMode,
  DocumentGenerationState,
  DocumentOrigin,
  DocumentRequestStatus,
  DocumentTemplateVersionStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { generateDocument } from "@/lib/services/document-generation";
import { publicIssuedDocumentProjection } from "@/lib/services/document-generation-snapshots";
import { releaseIssuedDocument } from "@/lib/services/document-release";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";
import { defaultTemplateDefinition } from "@/lib/services/document-template-builder";

type Check = [name: string, passed: boolean, detail: string];

async function main() {
  assertSafeVerificationDatabase();
  const checks: Check[] = [];
  const runId = `GEN_VERIFY_${Date.now()}`;
  const requestIds: string[] = [];
  const contextIds: string[] = [];
  let definitionId: string | null = null;
  let templateSetId: string | null = null;
  let publishedTemplateId: string | null = null;
  let draftTemplateId: string | null = null;
  try {
    const administrators = await platformPrisma.user.findMany({ where: { active: true, role: { in: [Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.ADMIN] } }, orderBy: { tenantId: "asc" } });
    const homeowners = await platformPrisma.homeownerProfile.findMany({ where: { tenantId: { in: [...new Set(administrators.map((item) => item.tenantId))] } }, include: { user: true } });
    const admin = administrators.find((item) => homeowners.some((homeowner) => homeowner.tenantId === item.tenantId));
    const homeowner = admin ? homeowners.find((item) => item.tenantId === admin.tenantId) : null;
    const tenant = admin ? await platformPrisma.tenant.findUnique({ where: { id: admin.tenantId } }) : null;
    if (!tenant || !admin || !homeowner) throw new Error("A local tenant with an administrator and homeowner is required.");
    const otherTenantUser = await platformPrisma.user.findFirst({ where: { tenantId: { not: tenant.id }, active: true, role: { in: [Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.ADMIN, Role.SUPER_ADMIN] } } });
    const context = documentContextFromUser(admin, runId);
    contextIds.push(runId);

    const definition = await platformPrisma.documentDefinition.create({
      data: {
        tenantId: tenant.id,
        code: runId,
        displayName: "Generation Engine Verification",
        category: "Verification",
        status: DocumentDefinitionStatus.ACTIVE,
        active: true,
        deliveryMode: DocumentDeliveryMode.INSTANT_DOWNLOAD,
        approvalRequired: false,
        paymentRequired: false,
        paymentBeforeApproval: false,
        allowImmediateDownload: true,
        requiresAdminReview: false,
        releaseRequired: true,
        homeownerDownloadEnabled: true,
        walkInEnabled: false,
        allowRegeneration: true,
        numberingFormat: "{PREFIX}-{YYYY}-{SEQUENCE:6}",
        qrEnabled: true,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    definitionId = definition.id;
    const set = await platformPrisma.documentTemplateSet.create({ data: { tenantId: tenant.id, definitionId: definition.id, name: `${runId} Template`, createdById: admin.id, updatedById: admin.id } });
    templateSetId = set.id;
    const template = verificationTemplate();
    const published = await platformPrisma.documentTemplateVersion.create({ data: { tenantId: tenant.id, templateSetId: set.id, version: 1, status: DocumentTemplateVersionStatus.PUBLISHED, definitionJson: json(template), publishedAt: new Date(), publishedById: admin.id, createdById: admin.id } });
    publishedTemplateId = published.id;
    const draft = await platformPrisma.documentTemplateVersion.create({ data: { tenantId: tenant.id, templateSetId: set.id, version: 2, status: DocumentTemplateVersionStatus.DRAFT, definitionJson: json(template), createdById: admin.id } });
    draftTemplateId = draft.id;
    await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { assignedTemplateVersionId: published.id } });

    const request = await createRequest(tenant.id, definition.id, published.id, homeowner.id, admin.id, template, runId);
    requestIds.push(request.id);
    const baseline = await sideEffectCounts(tenant.id, definition.id, request.id);
    const preview = await generateDocument(context, request.id, { mode: DocumentGenerationMode.PREVIEW, correlationId: `${runId}:preview` });
    const afterPreview = await sideEffectCounts(tenant.id, definition.id, request.id);
    add(checks, "preview produces safe HTML", preview.state === DocumentGenerationState.GENERATED && preview.contentType === "text/html; charset=utf-8" && Boolean(preview.content), preview.state);
    add(checks, "preview is visibly marked", preview.content?.includes("PREVIEW - NOT VALID FOR ISSUANCE") === true, "watermark");
    add(checks, "preview does not allocate number", baseline.counter === afterPreview.counter, `${baseline.counter} -> ${afterPreview.counter}`);
    add(checks, "preview creates no version or token", afterPreview.versions === 0 && afterPreview.tokens === 0, JSON.stringify(afterPreview));
    add(checks, "explicit authorized draft preview works", (await generateDocument(context, request.id, { mode: DocumentGenerationMode.PREVIEW, draftTemplateVersionId: draft.id })).templateVersionId === draft.id, draft.id);
    await expectRuntimeError(checks, "homeowner draft preview requires template permission", async () => generateDocument(documentContextFromUser(homeowner.user), request.id, { mode: DocumentGenerationMode.PREVIEW, draftTemplateVersionId: draft.id }), "PERMISSION_DENIED");

    const validation = await generateDocument(context, request.id, { mode: DocumentGenerationMode.VALIDATE, correlationId: `${runId}:validate` });
    add(checks, "validate returns ready without rendering official output", validation.state === DocumentGenerationState.READY && validation.content === null && validation.documentNumber === null, validation.state);
    await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { active: false, status: DocumentDefinitionStatus.INACTIVE } });
    const inactive = await generateDocument(context, request.id, { mode: DocumentGenerationMode.VALIDATE });
    add(checks, "inactive definition blocks validation", inactive.state === DocumentGenerationState.BLOCKED && inactive.issues.some((item) => item.code === "DEFINITION_INACTIVE"), inactive.issues.map((item) => item.code).join(","));
    await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { active: true, status: DocumentDefinitionStatus.ACTIVE } });

    const issueKey = `${runId}:retry-safe`;
    await expectRuntimeError(checks, "draft is rejected for ISSUE", async () => generateDocument(context, request.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: issueKey, draftTemplateVersionId: draft.id }), "TEMPLATE_UNAVAILABLE");
    const afterFailedIssue = await sideEffectCounts(tenant.id, definition.id, request.id);
    add(checks, "failed issue creates no number version or token", afterFailedIssue.counter === baseline.counter && afterFailedIssue.versions === 0 && afterFailedIssue.tokens === 0, JSON.stringify(afterFailedIssue));

    const issued = await generateDocument(context, request.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: issueKey, correlationId: `${runId}:issue` });
    if (!issued.documentVersionId || !issued.documentNumber || !issued.content || !issued.contentHash) throw new Error("Official issuance did not return required output identifiers.");
    const replay = await generateDocument(context, request.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: issueKey, correlationId: `${runId}:replay` });
    add(checks, "retry after safe failure succeeds", issued.state === DocumentGenerationState.RELEASE_PENDING, issued.state);
    add(checks, "same idempotency key replays same result", replay.idempotentReplay && replay.documentVersionId === issued.documentVersionId && replay.documentNumber === issued.documentNumber, replay.documentNumber ?? "none");
    const issuedRow = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: issued.documentVersionId }, include: { verificationTokens: true } });
    add(checks, "issued output hash is exact", issuedRow.contentHash === createHash("sha256").update(issuedRow.generatedContent, "utf8").digest("hex"), issuedRow.contentHash ?? "none");
    add(checks, "renderer metadata and content type persist", issuedRow.rendererName === "hoahub-safe-html" && issuedRow.rendererVersion === "1.0.0" && issuedRow.contentType === "text/html; charset=utf-8", `${issuedRow.rendererName}@${issuedRow.rendererVersion}`);
    add(checks, "exact published template and safe snapshots persist", issuedRow.templateVersionId === published.id && Boolean(issuedRow.definitionSnapshot) && Boolean(issuedRow.resolvedDataSnapshot) && Boolean(issuedRow.capabilitiesSnapshot), issuedRow.templateVersionId ?? "none");
    add(checks, "verification token is hashed and version-linked", issuedRow.verificationTokens.length === 1 && /^[a-f0-9]{64}$/.test(issuedRow.verificationTokens[0].tokenHash), String(issuedRow.verificationTokens.length));
    add(checks, "request data is HTML escaped", issuedRow.generatedContent.includes("&lt;script&gt;alert") && !issuedRow.generatedContent.includes("<script>alert"), "escaped request purpose");

    const released = await releaseIssuedDocument(context, { documentVersionId: issuedRow.id, reason: "Verification release" });
    const releaseReplay = await releaseIssuedDocument(context, { documentVersionId: issuedRow.id, reason: "Duplicate release" });
    add(checks, "release records actor and timestamp", released.released && released.documentVersion.releasedById === admin.id && Boolean(released.documentVersion.releasedAt), released.documentVersion.issuedStatus);
    add(checks, "duplicate release is idempotent", releaseReplay.idempotentReplay && !releaseReplay.released, String(releaseReplay.idempotentReplay));
    const releaseNotifications = await platformPrisma.notificationLog.count({ where: { tenantId: tenant.id, entityId: request.id, type: "DOCUMENT_RELEASED" } });
    add(checks, "release notification is not duplicated", releaseNotifications === 1, String(releaseNotifications));

    const reissued = await generateDocument(context, request.id, { mode: DocumentGenerationMode.REISSUE, idempotencyKey: `${runId}:reissue`, reissueOfVersionId: issuedRow.id, reason: "Corrected recipient copy" });
    if (!reissued.documentVersionId) throw new Error("Reissue did not create a document version.");
    const reissueRow = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: reissued.documentVersionId } });
    add(checks, "reissue creates immutable lineage and new number", reissueRow.reissueOfId === issuedRow.id && reissueRow.documentNumber !== issuedRow.documentNumber && reissueRow.version === 2, `${reissueRow.documentNumber} <- ${issuedRow.documentNumber}`);
    const originalAfterReissue = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: issuedRow.id } });
    add(checks, "reissue leaves original content unchanged", originalAfterReissue.contentHash === issuedRow.contentHash && originalAfterReissue.documentNumber === issuedRow.documentNumber, originalAfterReissue.documentNumber);

    if (otherTenantUser) {
      const otherContext = documentContextFromUser(otherTenantUser, `${runId}:cross-tenant`);
      await expectRuntimeError(checks, "cross-tenant request generation is rejected", async () => generateDocument(otherContext, request.id, { mode: DocumentGenerationMode.PREVIEW }), "NOT_FOUND");
      await expectRuntimeError(checks, "cross-tenant release is rejected", async () => releaseIssuedDocument(otherContext, { documentVersionId: issuedRow.id }), "NOT_FOUND");
    } else {
      add(checks, "cross-tenant fixtures available", false, "No second-tenant administrator exists.");
    }

    const concurrentRequest = await createRequest(tenant.id, definition.id, published.id, homeowner.id, admin.id, template, `${runId}:concurrent`);
    requestIds.push(concurrentRequest.id);
    const concurrent = await Promise.allSettled([
      generateDocument(context, concurrentRequest.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: `${runId}:concurrent:a` }),
      generateDocument(context, concurrentRequest.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: `${runId}:concurrent:b` }),
    ]);
    const concurrentVersions = await platformPrisma.documentVersion.count({ where: { tenantId: tenant.id, requestId: concurrentRequest.id } });
    add(checks, "concurrent issuance creates one official version", concurrentVersions === 1, `${concurrentVersions}; ${concurrent.map((item) => item.status).join(",")}`);

    const projection = publicIssuedDocumentProjection({ tenantName: tenant.name, documentType: definition.displayName, documentNumber: issuedRow.documentNumber, status: issuedRow.issuedStatus, issueDate: issuedRow.issuedAt });
    const publicKeys = Object.keys(projection).sort();
    add(checks, "public projection excludes personal and internal data", !publicKeys.some((key) => /resident|homeowner|address|balance|token|id$/i.test(key)), publicKeys.join(","));
    const auditText = JSON.stringify(await platformPrisma.auditLog.findMany({ where: { tenantId: tenant.id, OR: [{ correlationId: { startsWith: runId } }, { entityId: { in: [request.id, issuedRow.id, reissueRow.id] } }] }, select: { metadata: true } }));
    const rawToken = issued.verificationUrl?.split("/").pop();
    add(checks, "audit metadata excludes raw verification token", !rawToken || !auditText.includes(rawToken), rawToken ? "token absent" : "no raw token returned");
    const orchestratorSource = readFileSync("lib/services/document-generation.ts", "utf8");
    add(checks, "orchestrator has no document-type conditionals", !/CERTIFICATE_OF_|GATE_PASS|MOVE_IN|MOVE_OUT/.test(orchestratorSource), "configuration-driven source");
    add(checks, "legacy generation remains untouched", readFileSync("lib/actions/documents.ts", "utf8").includes("processDocumentRequestAction"), "legacy adapter retained");
  } finally {
    await cleanup({ requestIds, definitionId, templateSetId, publishedTemplateId, draftTemplateId, contextIds }).catch((error) => console.error("Cleanup failed", error));
  }

  let failures = 0;
  for (const [name, passed, detail] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
    if (!passed) failures += 1;
  }
  await platformPrisma.$disconnect();
  if (failures) throw new Error(`${failures} document generation engine checks failed.`);
  console.log(`Document generation engine verification passed (${checks.length} checks).`);
}

function assertSafeVerificationDatabase() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Document generation verification is disabled when NODE_ENV=production.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Document generation verification requires an explicit local DATABASE_URL.");
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Document generation verification requires a valid DATABASE_URL.");
  }

  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (url.protocol !== "mysql:" || !localHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Document generation verification may run only against a local MySQL database.");
  }
}

function verificationTemplate() {
  const template = defaultTemplateDefinition("Generation Engine Verification");
  template.sections.header = template.sections.header.filter((block) => block.type !== "logo");
  template.blocks = [...template.sections.header, ...template.sections.body, ...template.sections.footer];
  return template;
}

async function createRequest(tenantId: string, definitionId: string, templateVersionId: string, homeownerId: string, actorId: string, template: ReturnType<typeof verificationTemplate>, marker: string) {
  const homeowner = await platformPrisma.homeownerProfile.findFirstOrThrow({ where: { id: homeownerId, tenantId }, include: { user: true } });
  return platformPrisma.documentRequest.create({ data: {
    tenantId,
    homeownerId,
    definitionId,
    definitionVersionSnapshot: 1,
    definitionSnapshot: json({ definitionId, marker }),
    templateVersionIdSnapshot: templateVersionId,
    templateVersionSnapshot: 1,
    templateDefinitionSnapshot: json(template),
    subjectSnapshot: json({ fullName: homeowner.user.name, relationship: "Homeowner", address: homeowner.address, block: homeowner.block, lot: homeowner.lot }),
    requestDataSnapshot: json({ fields: { purpose: "<script>alert('x')</script> Official verification", remarks: marker } }),
    deliveryModeSnapshot: DocumentDeliveryMode.INSTANT_DOWNLOAD,
    approvalRequiredSnapshot: false,
    paymentRequiredSnapshot: false,
    origin: DocumentOrigin.HOMEOWNER,
    initiatedById: actorId,
    status: DocumentRequestStatus.SUBMITTED,
    purpose: "<script>alert('x')</script> Official verification",
    remarks: marker,
    validityDate: new Date(Date.now() + 86_400_000 * 30),
  } });
}

async function sideEffectCounts(tenantId: string, definitionId: string, requestId: string) {
  const [counter, versions, tokens] = await Promise.all([
    platformPrisma.documentDefinitionCounter.aggregate({ where: { tenantId, definitionId }, _sum: { lastNumber: true } }),
    platformPrisma.documentVersion.count({ where: { tenantId, requestId } }),
    platformPrisma.documentVerificationToken.count({ where: { tenantId, requestId } }),
  ]);
  return { counter: counter._sum.lastNumber ?? 0, versions, tokens };
}

async function expectRuntimeError(checks: Check[], name: string, operation: () => Promise<unknown>, code: string) {
  try {
    await operation();
    add(checks, name, false, "operation unexpectedly succeeded");
  } catch (error) {
    add(checks, name, error instanceof DocumentRuntimeError && error.code === code, error instanceof DocumentRuntimeError ? error.code : error instanceof Error ? error.message : "unknown error");
  }
}

async function cleanup(input: { requestIds: string[]; definitionId: string | null; templateSetId: string | null; publishedTemplateId: string | null; draftTemplateId: string | null; contextIds: string[] }) {
  if (input.requestIds.length) {
    const versions = await platformPrisma.documentVersion.findMany({ where: { requestId: { in: input.requestIds } }, orderBy: { version: "desc" }, select: { id: true } });
    await platformPrisma.notificationLog.deleteMany({ where: { entityId: { in: input.requestIds } } });
    await platformPrisma.documentGenerationAttempt.deleteMany({ where: { requestId: { in: input.requestIds } } });
    await platformPrisma.documentVerificationToken.deleteMany({ where: { requestId: { in: input.requestIds } } });
    for (const version of versions) await platformPrisma.documentVersion.delete({ where: { id: version.id } });
    await platformPrisma.documentRequestHistory.deleteMany({ where: { requestId: { in: input.requestIds } } });
    await platformPrisma.documentRequest.deleteMany({ where: { id: { in: input.requestIds } } });
    await platformPrisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...input.requestIds, ...versions.map((item) => item.id)] } }, { correlationId: { in: input.contextIds } }] } });
  }
  if (input.definitionId) {
    await platformPrisma.documentDefinition.updateMany({ where: { id: input.definitionId }, data: { assignedTemplateVersionId: null } });
    await platformPrisma.documentDefinitionCounter.deleteMany({ where: { definitionId: input.definitionId } });
  }
  if (input.draftTemplateId) await platformPrisma.documentTemplateVersion.deleteMany({ where: { id: input.draftTemplateId } });
  if (input.publishedTemplateId) await platformPrisma.documentTemplateVersion.deleteMany({ where: { id: input.publishedTemplateId } });
  if (input.templateSetId) await platformPrisma.documentTemplateSet.deleteMany({ where: { id: input.templateSetId } });
  if (input.definitionId) {
    await platformPrisma.auditLog.deleteMany({ where: { entityId: input.definitionId } });
    await platformPrisma.documentDefinition.deleteMany({ where: { id: input.definitionId } });
  }
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

void main().catch(async (error) => {
  console.error(error);
  await platformPrisma.$disconnect();
  process.exitCode = 1;
});
