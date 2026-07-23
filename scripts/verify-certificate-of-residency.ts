import { createHash } from "node:crypto";
import {
  DocumentDeliveryMode,
  DocumentGenerationMode,
  DocumentGenerationState,
  DocumentIssuedStatus,
  DocumentOrigin,
  DocumentRequestStatus,
  DocumentTemplateOwnership,
  DocumentTemplateVersionStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import {
  CERTIFICATE_OF_RESIDENCY_CODE,
  CERTIFICATE_OF_RESIDENCY_REFERENCE_TEMPLATE_NAME,
  createCertificateOfResidencyReferenceDraft,
  ensureCertifiedCertificateOfResidencyTemplate,
  provisionCertificateOfResidencyForTenant,
} from "@/lib/services/certificate-of-residency";
import {
  approveCertificateRequest,
  issueCertificate,
  releaseCertificate,
  reissueCertificate,
  resubmitCertificateRequest,
  returnCertificateRequestForCorrection,
  revokeCertificate,
} from "@/lib/services/document-certificate-lifecycle";
import { generateDocument } from "@/lib/services/document-generation";
import { getIssuedDocument } from "@/lib/services/document-release";
import { evaluateDocumentPolicies } from "@/lib/services/document-policies";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";
import { assertEditableTemplateOwnership, restoreTenantTemplateFromCertified } from "@/lib/services/document-template-ownership";
import { startDocumentWorkflow } from "@/lib/services/document-workflows";
import { verifyDocumentToken } from "@/lib/services/document-verification";

type Check = [name: string, passed: boolean, detail: string];

async function main() {
  assertLocalDatabase();
  await cleanupStaleFixtures();
  const marker = `COR_VERIFY_${Date.now()}`;
  const checks: Check[] = [];
  const tenantIds: string[] = [];
  try {
    const fixture = await createFixture(marker, "a");
    const other = await createFixture(marker, "b", false);
    tenantIds.push(fixture.tenant.id, other.tenant.id);
    const context = documentContextFromUser(fixture.admin, marker);
    const homeownerContext = documentContextFromUser(fixture.homeownerUser, `${marker}:homeowner`);
    const otherContext = documentContextFromUser(other.admin, `${marker}:other`);

    const certified1 = await ensureCertifiedCertificateOfResidencyTemplate();
    const certified2 = await ensureCertifiedCertificateOfResidencyTemplate();
    add(checks, "certified seed is idempotent", certified1.version.id === certified2.version.id && !certified2.created, certified2.version.id);
    add(checks, "certified template is platform-owned and published", certified1.set.ownershipType === DocumentTemplateOwnership.CERTIFIED && certified1.version.status === "PUBLISHED" && !certified1.set.editable, certified1.set.ownershipType);
    await expectFailure(checks, "certified template is read-only", () => Promise.resolve(assertEditableTemplateOwnership(certified1.set.ownershipType)), "read-only");

    const provision1 = await provisionCertificateOfResidencyForTenant(context);
    const provision2 = await provisionCertificateOfResidencyForTenant(context);
    add(checks, "tenant provisioning is idempotent", provision1.definitionId === provision2.definitionId && provision1.assignedTemplateVersionId === provision2.assignedTemplateVersionId, provision2.definitionId);
    const definition = await platformPrisma.documentDefinition.findUniqueOrThrow({ where: { id: provision1.definitionId }, include: { fields: true, assignedTemplateVersion: { include: { templateSet: true } }, workflowDefinition: { include: { steps: true } }, policyAssignments: { include: { policy: true } }, numberingConfiguration: true } });
    add(checks, "definition has reference capabilities", definition.active && definition.walkInEnabled && definition.approvalRequired && definition.qrEnabled && definition.allowRegeneration && definition.releaseRequired, definition.code);
    add(checks, "required request fields are configured", definition.fields.some((field) => field.key === "purpose" && field.required) && definition.fields.some((field) => field.key === "intendedRecipient" && !field.required), definition.fields.map((field) => field.key).join(","));
    add(checks, "tenant published template preserves certified lineage", definition.assignedTemplateVersion?.status === "PUBLISHED" && definition.assignedTemplateVersion.templateSet.sourceTemplateVersionId === certified1.version.id && definition.assignedTemplateVersion.ownershipType === DocumentTemplateOwnership.TENANT, definition.assignedTemplateVersion?.id ?? "none");
    add(checks, "approval workflow has one unnamed authorized step", definition.workflowDefinition?.steps.length === 1 && !definition.workflowDefinition.steps[0].approverUserId && !definition.workflowDefinition.steps[0].approverRole, String(definition.workflowDefinition?.steps.length));
    add(checks, "policy assignments are present", ["ACTIVE_RESIDENT", "PROPERTY_OWNERSHIP", "OUTSTANDING_BALANCE", "VIOLATION_STATUS"].every((type) => definition.policyAssignments.some((assignment) => assignment.policy.type === type)), definition.policyAssignments.map((assignment) => assignment.policy.type).join(","));
    add(checks, "numbering configuration is tenant-specific", definition.numberingConfiguration?.prefix === "COR" && definition.numberingConfiguration.sequenceLength === 6, definition.numberingConfiguration?.prefix ?? "none");

    const referenceDraft = await createCertificateOfResidencyReferenceDraft(context, certified1.version.id);
    const referenceDraftReplay = await createCertificateOfResidencyReferenceDraft(context, certified1.version.id);
    const referenceSet = await platformPrisma.documentTemplateSet.findFirst({ where: { tenantId: fixture.tenant.id, name: CERTIFICATE_OF_RESIDENCY_REFERENCE_TEMPLATE_NAME }, include: { versions: true } });
    add(checks, "visual certificate reference creates a separate tenant draft", referenceDraft.created && referenceDraft.draft.status === DocumentTemplateVersionStatus.DRAFT && referenceDraft.draft.sourceVersionId === certified1.version.id && referenceSet?.versions.length === 1, referenceDraft.draft.id);
    add(checks, "visual certificate reference draft is idempotent and unpublished", !referenceDraftReplay.created && referenceDraftReplay.draft.id === referenceDraft.draft.id && definition.assignedTemplateVersionId !== referenceDraft.draft.id, referenceDraftReplay.draft.status);
    add(checks, "visual reference draft preserves the officer-list schema", JSON.stringify(referenceDraft.draft.definitionJson).includes("officerList") && JSON.stringify(referenceDraft.draft.definitionJson).includes("TENANT_ORGANIZATION_OFFICERS"), referenceDraft.draft.id);

    await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { signatoryOfficerId: fixture.officer.id } });
    const restored = await restoreTenantTemplateFromCertified({ tenantId: fixture.tenant.id, templateSetId: definition.assignedTemplateVersion!.templateSetId, certifiedVersionId: certified1.version.id, createdById: fixture.admin.id });
    add(checks, "restore default creates a new tenant draft", restored.status === "DRAFT" && restored.sourceVersionId === certified1.version.id, `v${restored.version}`);
    const publishedFingerprint = createHash("sha256").update(JSON.stringify(definition.assignedTemplateVersion!.definitionJson)).digest("hex");
    await ensureCertifiedCertificateOfResidencyTemplate();
    const publishedAfterSeed = await platformPrisma.documentTemplateVersion.findUniqueOrThrow({ where: { id: definition.assignedTemplateVersion!.id } });
    add(checks, "repeated seed does not overwrite tenant customization", createHash("sha256").update(JSON.stringify(publishedAfterSeed.definitionJson)).digest("hex") === publishedFingerprint, publishedFingerprint);

    const request = await createRequest(fixture, definition.id, definition.assignedTemplateVersion!.id, marker);
    await startDocumentWorkflow(homeownerContext, request.id);
    const policies = await evaluateDocumentPolicies(homeownerContext, definition.id, { homeownerId: fixture.homeowner.id, requestId: request.id });
    add(checks, "active residency and property policies pass", policies.filter((result) => result.policyType === "ACTIVE_RESIDENT" || result.policyType === "PROPERTY_OWNERSHIP").every((result) => result.status === "PASS"), policies.map((result) => `${result.policyType}:${result.status}`).join(","));
    add(checks, "disabled violation policy is skipped", policies.some((result) => result.policyType === "VIOLATION_STATUS" && result.status === "SKIPPED"), "VIOLATION_STATUS");

    const before = await sideEffects(request.id, definition.id);
    const preview = await generateDocument(context, request.id, { mode: DocumentGenerationMode.PREVIEW });
    const afterPreview = await sideEffects(request.id, definition.id);
    add(checks, "preview is watermarked and side-effect free", Boolean(preview.content?.includes("PREVIEW - NOT VALID FOR ISSUANCE")) && before.versions === afterPreview.versions && before.tokens === afterPreview.tokens && before.counter === afterPreview.counter, preview.state);
    add(checks, "preview binds the selected request data", Boolean(preview.content?.includes("Resident Verification") && preview.content?.includes("Block 1 Lot 2, Verification Village") && preview.content?.includes("Employment verification") && !preview.content?.includes("Juan Dela Cruz")), "request-bound preview");
    const validationBeforeApproval = await generateDocument(context, request.id, { mode: DocumentGenerationMode.VALIDATE });
    add(checks, "validation reports incomplete approval", validationBeforeApproval.issues.some((issue) => issue.code === "WORKFLOW_INCOMPLETE" || issue.code === "APPROVAL_INCOMPLETE"), validationBeforeApproval.issues.map((issue) => issue.code).join(","));
    await expectFailure(checks, "unauthorized homeowner approval is rejected", () => approveCertificateRequest(homeownerContext, request.id), "Permission denied");

    await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { signatoryOfficerId: null } });
    const missingSignatory = await generateDocument(context, request.id, { mode: DocumentGenerationMode.VALIDATE });
    add(checks, "missing signatory blocks official readiness", missingSignatory.issues.some((issue) => issue.code === "SIGNATORY_MISSING"), missingSignatory.issues.map((issue) => issue.code).join(","));
    await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { signatoryOfficerId: fixture.officer.id } });

    const issued = await approveCertificateRequest(context, request.id, "Verified residency and property relationship.") as Awaited<ReturnType<typeof approveCertificateRequest>> & { documentVersionId?: string | null; documentNumber?: string | null; verificationUrl?: string | null };
    const approved = await platformPrisma.documentRequest.findUniqueOrThrow({ where: { id: request.id } });
    add(checks, "authorized approval issues request", approved.status === DocumentRequestStatus.ISSUED && Boolean(approved.approvedAt && approved.issuedAt), approved.status);
    if (!issued.documentVersionId || !issued.documentNumber || !issued.verificationUrl) throw new Error(`Certificate approval did not return the expected immutable result: ${JSON.stringify(issued)}`);
    const duplicateIssue = await issueCertificate(context, request.id, `${marker}:issue`);
    add(checks, "duplicate manual issue is rejected", duplicateIssue.state === DocumentGenerationState.BLOCKED && duplicateIssue.issues.some((issue) => issue.code === "DUPLICATE_ISSUANCE"), duplicateIssue.issues.map((issue) => issue.code).join(","));
    const issuedRow = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: issued.documentVersionId }, include: { verificationTokens: true } });
    add(checks, "number and exact published template are captured", /^COR-\d{4}-\d{6}$/.test(issued.documentNumber) && issuedRow.templateVersionId === definition.assignedTemplateVersion!.id, issued.documentNumber);
    add(checks, "immutable content hash matches output", issuedRow.contentHash === createHash("sha256").update(issuedRow.generatedContent).digest("hex") && issuedRow.generatedContent.includes("CERTIFICATE OF RESIDENCY"), issuedRow.contentHash ?? "none");
    add(checks, "verification token is opaque and hashed", issuedRow.verificationTokens.length === 1 && /^[a-f0-9]{64}$/.test(issuedRow.verificationTokens[0].tokenHash), String(issuedRow.verificationTokens.length));

    const release = await releaseCertificate(context, issuedRow.id);
    const releaseReplay = await releaseCertificate(context, issuedRow.id);
    const exact = await getIssuedDocument(homeownerContext, issuedRow.id);
    add(checks, "release is idempotent and homeowner can read exact version", release.released && releaseReplay.idempotentReplay && exact.generatedContent === issuedRow.generatedContent && exact.issuedStatus === DocumentIssuedStatus.RELEASED, exact.issuedStatus);
    await expectFailure(checks, "other tenant cannot read issued version", () => getIssuedDocument(otherContext, issuedRow.id), "not found");

    const rawToken = issued.verificationUrl.split("/").pop()!;
    const publicValid = await verifyDocumentToken(rawToken);
    add(checks, "public verification returns safe valid projection", publicValid.status === "VALID" && publicValid.documentNumber === issued.documentNumber && !("homeowner" in publicValid) && !("address" in publicValid), Object.keys(publicValid).join(","));
    const invalid = await verifyDocumentToken("x".repeat(40));
    add(checks, "invalid token returns generic result", invalid.status === "NOT_FOUND" && invalid.documentNumber === null, invalid.status);

    const reissued = await reissueCertificate(context, { requestId: request.id, sourceVersionId: issuedRow.id, reason: "Corrected official copy", idempotencyKey: `${marker}:reissue` });
    if (!reissued.documentVersionId) throw new Error("Reissue did not create a version.");
    const reissueRow = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: reissued.documentVersionId } });
    add(checks, "reissue creates a new number and immutable lineage", reissueRow.reissueOfId === issuedRow.id && reissueRow.documentNumber !== issuedRow.documentNumber && reissueRow.version === 2, `${reissueRow.documentNumber}<-${issuedRow.documentNumber}`);
    const originalAfterReissue = await platformPrisma.documentVersion.findUniqueOrThrow({ where: { id: issuedRow.id } });
    add(checks, "reissue leaves original unchanged", originalAfterReissue.contentHash === issuedRow.contentHash && originalAfterReissue.documentNumber === issuedRow.documentNumber, originalAfterReissue.documentNumber);

    await revokeCertificate(context, issuedRow.id, "Superseded by corrected reissue.");
    const publicRevoked = await verifyDocumentToken(rawToken);
    add(checks, "revocation preserves record and changes public status", publicRevoked.status === "REVOKED" && (await platformPrisma.documentVersion.count({ where: { id: issuedRow.id } })) === 1, publicRevoked.status);
    await expectFailure(checks, "cross-tenant release is rejected", () => releaseCertificate(otherContext, reissueRow.id), "not found");

    const correction = await createRequest(fixture, definition.id, definition.assignedTemplateVersion!.id, `${marker}:correction`);
    await startDocumentWorkflow(homeownerContext, correction.id);
    await returnCertificateRequestForCorrection(context, correction.id, "Clarify the stated purpose.");
    await resubmitCertificateRequest(homeownerContext, { requestId: correction.id, purpose: "Updated purpose for employment verification", remarks: "Corrected as requested." });
    const corrected = await platformPrisma.documentRequest.findUniqueOrThrow({ where: { id: correction.id }, include: { histories: true } });
    add(checks, "return and resubmit remain traceable", corrected.status === DocumentRequestStatus.UNDER_REVIEW && corrected.histories.some((history) => history.status === DocumentRequestStatus.RETURNED_FOR_CORRECTION), corrected.status);

    await platformPrisma.homeownerProfile.update({ where: { id: fixture.homeowner.id }, data: { status: "INACTIVE" } });
    const inactive = await evaluateDocumentPolicies(context, definition.id, { homeownerId: fixture.homeowner.id, requestId: correction.id });
    add(checks, "inactive residency blocks policy evaluation", inactive.some((result) => result.policyType === "ACTIVE_RESIDENT" && result.status === "FAIL"), inactive.map((result) => `${result.policyType}:${result.status}`).join(","));
    await platformPrisma.homeownerProfile.update({ where: { id: fixture.homeowner.id }, data: { status: "ACTIVE" } });
  } finally {
    for (const tenantId of tenantIds) await cleanupFixture(tenantId).catch((error) => console.error(`Cleanup failed for ${tenantId}`, error));
  }

  const failed = checks.filter((check) => !check[1]);
  for (const [name, passed, detail] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
  await platformPrisma.$disconnect();
  if (failed.length) throw new Error(`${failed.length} Certificate of Residency checks failed.`);
  console.log(`Certificate of Residency verification passed (${checks.length} checks).`);
}

async function createFixture(marker: string, suffix: string, withHomeowner = true) {
  const tenant = await platformPrisma.tenant.create({ data: { name: `${marker} HOA ${suffix}`, shortName: `COR${suffix}`, slug: `${marker.toLowerCase().replaceAll("_", "-")}-${suffix}`, address: "1 Verification Street, Test City", contactNumber: "09170000000", email: `${marker.toLowerCase()}-${suffix}@example.test`, secRegistrationNumber: "SEC-TEST", tinNumber: "000-000-000", status: "ACTIVE" } });
  const admin = await platformPrisma.user.create({ data: { tenantId: tenant.id, name: "Certificate Test Admin", email: `admin-${suffix}@example.test`, username: `${marker}_${suffix}_admin`, passwordHash: "LOCAL_TEST_ONLY", role: Role.ADMIN, active: true } });
  const officer = await platformPrisma.organizationOfficer.create({ data: { tenantId: tenant.id, fullName: "Alex Verification", position: "HOA President", displayOrder: 1, active: true, effectiveDate: new Date("2026-01-01"), updatedById: admin.id } });
  const homeownerUser = withHomeowner ? await platformPrisma.user.create({ data: { tenantId: tenant.id, name: "Resident Verification", email: `resident-${suffix}@example.test`, username: `${marker}_${suffix}_resident`, passwordHash: "LOCAL_TEST_ONLY", role: Role.HOMEOWNER, active: true } }) : admin;
  const homeowner = withHomeowner ? await platformPrisma.homeownerProfile.create({ data: { tenantId: tenant.id, userId: homeownerUser.id, address: "Block 1 Lot 2, Verification Village", block: "1", lot: "2", phone: "09171111111", residencyDate: new Date("2020-01-01"), phase: "Phase 1", propertyType: "Homeowner", occupancyStatus: "Owner occupied", status: "ACTIVE", monthlyDuesAmount: new Prisma.Decimal(500) } }) : null;
  return { tenant, admin, officer, homeownerUser, homeowner: homeowner! };
}

async function createRequest(fixture: Awaited<ReturnType<typeof createFixture>>, definitionId: string, templateVersionId: string, marker: string) {
  return platformPrisma.documentRequest.create({ data: { tenantId: fixture.tenant.id, homeownerId: fixture.homeowner.id, definitionId, definitionVersionSnapshot: 1, definitionSnapshot: json({ code: CERTIFICATE_OF_RESIDENCY_CODE }), templateVersionIdSnapshot: templateVersionId, templateVersionSnapshot: 1, subjectSnapshot: json({ fullName: fixture.homeownerUser.name, relationship: "Homeowner", address: fixture.homeowner.address, propertyAddress: fixture.homeowner.address, block: fixture.homeowner.block, lot: fixture.homeowner.lot }), requestDataSnapshot: json({ fields: { purpose: "Employment verification", intendedRecipient: "Human Resources", remarks: marker } }), deliveryModeSnapshot: DocumentDeliveryMode.APPROVAL_REQUIRED, approvalRequiredSnapshot: true, paymentRequiredSnapshot: false, feeAmountSnapshot: new Prisma.Decimal(0), numberOfCopies: 1, origin: DocumentOrigin.HOMEOWNER, initiatedById: fixture.homeownerUser.id, status: DocumentRequestStatus.PENDING_APPROVAL, purpose: "Employment verification", remarks: marker, propertyDetails: fixture.homeowner.address, validityDate: new Date(Date.now() + 30 * 86_400_000), histories: { create: { tenantId: fixture.tenant.id, status: DocumentRequestStatus.PENDING_APPROVAL, actorId: fixture.homeownerUser.id, note: "Certificate fixture submitted." } } } });
}

async function sideEffects(requestId: string, definitionId: string) {
  const [versions, tokens, counter] = await Promise.all([platformPrisma.documentVersion.count({ where: { requestId } }), platformPrisma.documentVerificationToken.count({ where: { requestId } }), platformPrisma.documentDefinitionCounter.aggregate({ where: { definitionId }, _sum: { lastNumber: true } })]);
  return { versions, tokens, counter: counter._sum.lastNumber ?? 0 };
}

async function cleanupFixture(tenantId: string) {
  const requests = await platformPrisma.documentRequest.findMany({ where: { tenantId }, select: { id: true } });
  const requestIds = requests.map((request) => request.id);
  await platformPrisma.notificationLog.deleteMany({ where: { tenantId } });
  await platformPrisma.auditLog.deleteMany({ where: { tenantId } });
  await platformPrisma.documentGenerationAttempt.deleteMany({ where: { tenantId } });
  await platformPrisma.documentVerificationToken.deleteMany({ where: { tenantId } });
  const versions = await platformPrisma.documentVersion.findMany({ where: { tenantId }, orderBy: { version: "desc" }, select: { id: true } });
  for (const version of versions) await platformPrisma.documentVersion.delete({ where: { id: version.id } });
  if (requestIds.length) {
    await platformPrisma.documentRequestEditAudit.deleteMany({ where: { requestId: { in: requestIds } } });
    await platformPrisma.documentRequestHistory.deleteMany({ where: { requestId: { in: requestIds } } });
    await platformPrisma.documentRequest.deleteMany({ where: { id: { in: requestIds } } });
  }
  await platformPrisma.documentDefinition.updateMany({ where: { tenantId }, data: { assignedTemplateVersionId: null, workflowDefinitionId: null, signatoryOfficerId: null } });
  await platformPrisma.documentDefinitionCounter.deleteMany({ where: { tenantId } });
  await platformPrisma.documentNumberingConfiguration.deleteMany({ where: { tenantId } });
  await platformPrisma.documentDefinitionPolicyAssignment.deleteMany({ where: { tenantId } });
  await platformPrisma.documentDefinitionField.deleteMany({ where: { tenantId } });
  await platformPrisma.documentTemplateVersion.deleteMany({ where: { tenantId } });
  await platformPrisma.documentTemplateSet.deleteMany({ where: { tenantId } });
  await platformPrisma.documentDefinition.deleteMany({ where: { tenantId } });
  await platformPrisma.documentWorkflowStep.deleteMany({ where: { tenantId } });
  await platformPrisma.documentWorkflowDefinition.deleteMany({ where: { tenantId } });
  await platformPrisma.documentPolicy.deleteMany({ where: { tenantId } });
  await platformPrisma.organizationOfficerHistory.deleteMany({ where: { tenantId } });
  await platformPrisma.organizationOfficer.deleteMany({ where: { tenantId } });
  await platformPrisma.homeownerProfile.deleteMany({ where: { tenantId } });
  await platformPrisma.user.deleteMany({ where: { tenantId } });
  await platformPrisma.systemSetting.deleteMany({ where: { tenantId } });
  await platformPrisma.tenant.delete({ where: { id: tenantId } });
}

async function cleanupStaleFixtures() {
  const tenants = await platformPrisma.tenant.findMany({ where: { slug: { startsWith: "cor-verify-" } }, select: { id: true } });
  for (const tenant of tenants) await cleanupFixture(tenant.id);
}

async function expectFailure(checks: Check[], name: string, operation: () => Promise<unknown>, expected: string) {
  try { await operation(); add(checks, name, false, "operation unexpectedly succeeded"); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); add(checks, name, detail.toLowerCase().includes(expected.toLowerCase()), detail); }
}

function add(checks: Check[], name: string, passed: boolean, detail: string) { checks.push([name, passed, detail]); }
function json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function assertLocalDatabase() { if (process.env.NODE_ENV === "production") throw new Error("Verification is disabled in production."); const value = process.env.DATABASE_URL; if (!value) throw new Error("An explicit local DATABASE_URL is required."); const url = new URL(value); if (url.protocol !== "mysql:" || !new Set(["localhost", "127.0.0.1", "::1"]).has(url.hostname.toLowerCase())) throw new Error("Verification may run only against local MySQL."); }

void main().catch(async (error) => { console.error(error); await platformPrisma.$disconnect(); process.exitCode = 1; });
