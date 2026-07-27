import { readFileSync } from "node:fs";
import {
  DocumentDefinitionStatus,
  DocumentDeliveryMode,
  DocumentGenerationMode,
  DocumentOrigin,
  DocumentRequestStatus,
  DocumentSubjectType,
  DocumentTemplateVersionStatus,
  DocumentWorkflowApprovalMode,
  DocumentWorkflowStepType,
  PaymentRequestStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { approvePaymentRequest } from "@/lib/services/payment-requests";
import { generateDocument } from "@/lib/services/document-generation";
import { revokeIssuedDocument } from "@/lib/services/document-release";
import { verifyDocumentToken } from "@/lib/services/document-verification";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";
import { documentContextFromUser } from "@/lib/services/document-runtime-context";
import { defaultTemplateDefinition } from "@/lib/services/document-template-builder";
import { approveDocumentWorkflowRequest, executeDocumentWorkflowAfterSubmission, retryDocumentGeneration } from "@/lib/services/document-workflow-executor";

type Check = [name: string, passed: boolean, detail: string];
type Fixture = { tenantId: string; adminId: string; homeownerId: string; template: ReturnType<typeof defaultTemplateDefinition> };

async function main() {
  assertSafeLocalDatabase();
  const checks: Check[] = [];
  await cleanupStaleVerificationFixtures();
  const runId = `WF_VERIFY_${Date.now()}`;
  const requestIds: string[] = [];
  const definitionIds: string[] = [];
  const templateSetIds: string[] = [];
  const workflowIds: string[] = [];
  const memberIds: string[] = [];

  try {
    const fixture = await loadFixture();
    const admin = await platformPrisma.user.findUniqueOrThrow({ where: { id: fixture.adminId } });
    const homeowner = await platformPrisma.homeownerProfile.findUniqueOrThrow({ where: { id: fixture.homeownerId }, include: { user: true } });
    const context = documentContextFromUser(admin, runId);
    const homeownerContext = documentContextFromUser(homeowner.user, `${runId}:homeowner`);
    const otherAdmin = await platformPrisma.user.findFirst({ where: { active: true, tenantId: { not: fixture.tenantId }, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } } });

    const instant = await createDefinition(fixture, `${runId}_INSTANT`, "No Payment No Approval", { payment: false, approval: false }, definitionIds, templateSetIds);
    const requestA = await createRequest(fixture, instant.definitionId, instant.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED });
    requestIds.push(requestA.id);
    const resultA = await executeDocumentWorkflowAfterSubmission(homeownerContext, requestA.id);
    const issuedA = await requestState(requestA.id);
    add(checks, "scenario A issues immediately", resultA.action === "GENERATED" && issuedA.status === DocumentRequestStatus.ISSUED && issuedA.currentVersion === 1 && Boolean(issuedA.documentNumber && issuedA.generatedAt && issuedA.issuedAt), `${issuedA.status} ${issuedA.documentNumber}`);
    add(checks, "scenario A creates one version and token", issuedA.versions.length === 1 && issuedA.verificationTokens.length === 1, `${issuedA.versions.length}/${issuedA.verificationTokens.length}`);
    add(checks, "scenario A official QR has no preview warning", issuedA.generatedContent?.includes("PREVIEW QR") === false && issuedA.generatedContent?.includes("NOT VALID FOR VERIFICATION") === false, issuedA.generatedContent?.slice(0, 160) || "missing content");
    add(checks, "scenario A official QR uses verification wording", issuedA.generatedContent?.includes("SCAN TO VERIFY") === true || issuedA.generatedContent?.includes("Scan to verify") === true, "official QR label");

    const approval = await createDefinition(fixture, `${runId}_APPROVAL`, "Approval Required", { payment: false, approval: true, approverRole: admin.role }, definitionIds, templateSetIds, workflowIds);
    const requestB = await createRequest(fixture, approval.definitionId, approval.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED });
    requestIds.push(requestB.id);
    const pendingB = await executeDocumentWorkflowAfterSubmission(homeownerContext, requestB.id);
    add(checks, "scenario B moves to pending approval", pendingB.action === "APPROVAL_REQUIRED" && pendingB.status === DocumentRequestStatus.PENDING_APPROVAL, pendingB.status);
    await expectError(checks, "homeowner cannot approve", () => approveDocumentWorkflowRequest(homeownerContext, requestB.id), "PERMISSION_DENIED");
    if (otherAdmin) await expectError(checks, "cross-tenant admin cannot approve", () => approveDocumentWorkflowRequest(documentContextFromUser(otherAdmin), requestB.id), "NOT_FOUND");
    const approvedB = await approveDocumentWorkflowRequest(context, requestB.id, { remarks: "Approved by configured role." });
    const issuedB = await requestState(requestB.id);
    add(checks, "scenario B approval generates official document", approvedB.action === "GENERATED" && issuedB.status === DocumentRequestStatus.ISSUED && Boolean(issuedB.approvedAt && issuedB.approvedById), `${issuedB.status}`);

    const paid = await createDefinition(fixture, `${runId}_PAID`, "Paid Instant", { payment: true, approval: false }, definitionIds, templateSetIds);
    const requestC = await createRequest(fixture, paid.definitionId, paid.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED, paymentRequired: true, fee: "125.00" });
    requestIds.push(requestC.id);
    const pendingC = await executeDocumentWorkflowAfterSubmission(homeownerContext, requestC.id);
    const paymentC = await platformPrisma.paymentRequest.findFirstOrThrow({ where: { tenantId: fixture.tenantId, documentRequestId: requestC.id } });
    add(checks, "scenario C creates one linked payment obligation", pendingC.status === DocumentRequestStatus.PENDING_PAYMENT && paymentC.status === PaymentRequestStatus.PENDING_REVIEW && String(paymentC.amount) === "125", `${pendingC.status}/${paymentC.id}`);
    const retryC = await executeDocumentWorkflowAfterSubmission(homeownerContext, requestC.id);
    const paymentCountC = await platformPrisma.paymentRequest.count({ where: { tenantId: fixture.tenantId, documentRequestId: requestC.id } });
    add(checks, "scenario C retry does not duplicate payment obligation", retryC.paymentRequestId === paymentC.id && paymentCountC === 1, String(paymentCountC));
    await approvePaymentRequest(paymentC.id, admin.id, "Verified document fee.", fixture.tenantId);
    const issuedC = await requestState(requestC.id);
    const approvedPaymentC = await platformPrisma.paymentRequest.findFirstOrThrow({ where: { tenantId: fixture.tenantId, documentRequestId: requestC.id }, include: { collection: true } });
    add(checks, "scenario C payment confirmation issues document", issuedC.status === DocumentRequestStatus.ISSUED && approvedPaymentC.status === PaymentRequestStatus.APPROVED && Boolean(approvedPaymentC.collection?.receiptNumber), `${issuedC.status}/${approvedPaymentC.collection?.receiptNumber}`);

    const paidApproval = await createDefinition(fixture, `${runId}_PAID_APPROVAL`, "Paid Approval", { payment: true, approval: true, approverRole: admin.role }, definitionIds, templateSetIds, workflowIds);
    const requestD = await createRequest(fixture, paidApproval.definitionId, paidApproval.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED, paymentRequired: true, approvalRequired: true, fee: "175.00" });
    requestIds.push(requestD.id);
    const pendingD = await executeDocumentWorkflowAfterSubmission(homeownerContext, requestD.id);
    const paymentD = await platformPrisma.paymentRequest.findFirstOrThrow({ where: { tenantId: fixture.tenantId, documentRequestId: requestD.id } });
    await approvePaymentRequest(paymentD.id, admin.id, "Verified paid approval fee.", fixture.tenantId);
    const awaitingApprovalD = await requestState(requestD.id);
    add(checks, "scenario D waits for approval after payment", pendingD.status === DocumentRequestStatus.PENDING_PAYMENT && awaitingApprovalD.status === DocumentRequestStatus.PENDING_APPROVAL, awaitingApprovalD.status);
    await approveDocumentWorkflowRequest(context, requestD.id, { remarks: "Paid and approved." });
    const issuedD = await requestState(requestD.id);
    add(checks, "scenario D approval after receipt issues document", issuedD.status === DocumentRequestStatus.ISSUED && issuedD.versions.length === 1, `${issuedD.status}/${issuedD.versions.length}`);

    const member = await platformPrisma.householdMember.create({ data: { tenantId: fixture.tenantId, homeownerId: fixture.homeownerId, fullName: `${runId} Sevillañ`, relationship: "Child", birthDate: new Date("2016-01-21T00:00:00.000Z"), civilStatus: "Single", nationality: "Filipino", active: true, validatedAt: new Date(), validatedById: admin.id } });
    memberIds.push(member.id);
    const memberRequest = await createRequest(fixture, instant.definitionId, instant.templateVersionId, runId, { subjectMemberId: member.id });
    requestIds.push(memberRequest.id);
    await executeDocumentWorkflowAfterSubmission(homeownerContext, memberRequest.id);
    const issuedMember = await requestState(memberRequest.id);
    add(checks, "validated household member request issues", issuedMember.status === DocumentRequestStatus.ISSUED, member.id);
    add(checks, "household member is official subject", issuedMember.generatedContent?.includes(member.fullName) === true && issuedMember.generatedContent?.includes(homeowner.user.name) !== true, member.fullName);
    add(checks, "unicode household member name renders", issuedMember.generatedContent?.includes("Sevillañ") === true, issuedMember.generatedContent?.slice(0, 120) || "missing content");
    const unvalidated = await platformPrisma.householdMember.create({ data: { tenantId: fixture.tenantId, homeownerId: fixture.homeownerId, fullName: `${runId} Unvalidated Member`, relationship: "Sibling", active: true } });
    memberIds.push(unvalidated.id);
    const unvalidatedRequest = await createRequest(fixture, instant.definitionId, instant.templateVersionId, runId, { subjectMemberId: unvalidated.id });
    requestIds.push(unvalidatedRequest.id);
    await expectError(checks, "unvalidated household member is denied", () => executeDocumentWorkflowAfterSubmission(homeownerContext, unvalidatedRequest.id), "VALIDATION_FAILED");
    const inactive = await platformPrisma.householdMember.create({ data: { tenantId: fixture.tenantId, homeownerId: fixture.homeownerId, fullName: `${runId} Inactive Member`, relationship: "Parent", active: false, validatedAt: new Date(), validatedById: admin.id } });
    memberIds.push(inactive.id);
    const inactiveRequest = await createRequest(fixture, instant.definitionId, instant.templateVersionId, runId, { subjectMemberId: inactive.id });
    requestIds.push(inactiveRequest.id);
    await expectError(checks, "inactive household member is denied", () => executeDocumentWorkflowAfterSubmission(homeownerContext, inactiveRequest.id), "VALIDATION_FAILED");

    const invalidTemplate = defaultTemplateDefinition("Invalid Generation Fixture");
    invalidTemplate.sections.header = invalidTemplate.sections.header.filter((block) => block.type !== "logo");
    invalidTemplate.sections.body = [{ ...invalidTemplate.sections.body[0], id: "missing-required", binding: "request.unsupportedRequiredValue", content: "", required: true }];
    invalidTemplate.sections.footer = [];
    invalidTemplate.blocks = [...invalidTemplate.sections.header, ...invalidTemplate.sections.body, ...invalidTemplate.sections.footer];
    const invalid = await createDefinition(fixture, `${runId}_INVALID`, "Invalid Required Token", { payment: false, approval: false }, definitionIds, templateSetIds, [], invalidTemplate);
    const invalidRequest = await createRequest(fixture, invalid.definitionId, invalid.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED });
    requestIds.push(invalidRequest.id);
    const failedGeneration = await executeDocumentWorkflowAfterSubmission(homeownerContext, invalidRequest.id);
    const failedState = await requestState(invalidRequest.id);
    const failedAttempt = await platformPrisma.documentGenerationAttempt.findFirstOrThrow({ where: { tenantId: fixture.tenantId, requestId: invalidRequest.id } });
    add(checks, "generation failure returns recoverable action", failedGeneration.action === "GENERATION_FAILED" && failedGeneration.status === DocumentRequestStatus.SUBMITTED, `${failedGeneration.action}/${failedGeneration.status}`);
    add(checks, "generation exception does not leave request generating", failedState.status !== DocumentRequestStatus.GENERATING && failedAttempt.state === "BLOCKED", `${failedState.status}/${failedAttempt.state}`);
    add(checks, "safe homeowner generation failure message is recorded", failedState.histories.some((history) => history.note?.includes("HOA staff can retry processing it")), "safe failure history");
    const fixedTemplate = defaultTemplateDefinition("Recovered Generation Fixture");
    fixedTemplate.sections.header = fixedTemplate.sections.header.filter((block) => block.type !== "logo");
    fixedTemplate.blocks = [...fixedTemplate.sections.header, ...fixedTemplate.sections.body, ...fixedTemplate.sections.footer];
    await platformPrisma.documentTemplateVersion.update({ where: { id: invalid.templateVersionId }, data: { definitionJson: json(fixedTemplate) } });
    const beforeRetry = await sideEffects(fixture.tenantId, invalidRequest.id, invalid.definitionId);
    const retry = await retryDocumentGeneration(context, invalidRequest.id);
    const retryAgain = await retryDocumentGeneration(context, invalidRequest.id);
    const afterRetry = await sideEffects(fixture.tenantId, invalidRequest.id, invalid.definitionId);
    const recovered = await requestState(invalidRequest.id);
    add(checks, "authorized admin retry issues recovered request", retry.action === "GENERATED" && recovered.status === DocumentRequestStatus.ISSUED, `${retry.action}/${recovered.status}`);
    add(checks, "retry is idempotent for issued request", retryAgain.action === "NOOP" && afterRetry.versions - beforeRetry.versions === 1 && afterRetry.tokens - beforeRetry.tokens === 1, JSON.stringify({ beforeRetry, afterRetry, retryAgain: retryAgain.action }));

    const previewRequest = await createRequest(fixture, instant.definitionId, instant.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED });
    requestIds.push(previewRequest.id);
    const beforePreview = await sideEffects(fixture.tenantId, previewRequest.id, instant.definitionId);
    const preview = await generateDocument(context, previewRequest.id, { mode: DocumentGenerationMode.PREVIEW, correlationId: `${runId}:preview` });
    const afterPreview = await sideEffects(fixture.tenantId, previewRequest.id, instant.definitionId);
    add(checks, "preview uses PREVIEW and creates no official artifacts", preview.content?.includes("PREVIEW") === true && beforePreview.versions === afterPreview.versions && beforePreview.tokens === afterPreview.tokens && beforePreview.counter === afterPreview.counter, JSON.stringify(afterPreview));

    const qrRequest = await createRequest(fixture, instant.definitionId, instant.templateVersionId, runId, { status: DocumentRequestStatus.SUBMITTED });
    requestIds.push(qrRequest.id);
    const qrIssue = await generateDocument(context, qrRequest.id, { mode: DocumentGenerationMode.ISSUE, idempotencyKey: `${runId}:qr-issue` });
    const rawToken = qrIssue.verificationUrl?.split("/").pop() || "";
    const qrIssuedState = await requestState(qrRequest.id);
    add(checks, "localhost official verification URL is accepted", qrIssue.verificationUrl?.startsWith("http://localhost:3000/verify/documents/") === true, qrIssue.verificationUrl ?? "missing url");
    add(checks, "official generated QR output does not contain preview wording", qrIssuedState.generatedContent?.includes("PREVIEW QR") === false && qrIssuedState.generatedContent?.includes("NOT VALID FOR VERIFICATION") === false, qrIssuedState.generatedContent?.slice(0, 160) || "missing content");
    add(checks, "valid QR verification succeeds", (await verifyDocumentToken(rawToken)).status === "VALID", rawToken ? "token available" : "missing token");
    const tokenRow = await platformPrisma.documentVerificationToken.findFirstOrThrow({ where: { tenantId: fixture.tenantId, requestId: qrRequest.id } });
    await platformPrisma.documentVerificationToken.update({ where: { id: tokenRow.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    add(checks, "expired QR verification reports expired", (await verifyDocumentToken(rawToken)).status === "EXPIRED", "expired");
    await platformPrisma.documentVerificationToken.update({ where: { id: tokenRow.id }, data: { expiresAt: null } });
    const sourceVersion = await platformPrisma.documentVersion.findFirstOrThrow({ where: { tenantId: fixture.tenantId, requestId: qrRequest.id } });
    await generateDocument(context, qrRequest.id, { mode: DocumentGenerationMode.REISSUE, idempotencyKey: `${runId}:qr-reissue`, reissueOfVersionId: sourceVersion.id, reason: "Superseded verification check" });
    add(checks, "superseded QR verification reports superseded", (await verifyDocumentToken(rawToken)).status === "SUPERSEDED", "superseded");
    await revokeIssuedDocument(context, { documentVersionId: sourceVersion.id, reason: "Revoked verification check" });
    add(checks, "revoked QR verification reports revoked", (await verifyDocumentToken(rawToken)).status === "REVOKED", "revoked");
    add(checks, "invalid QR verification reports not found", (await verifyDocumentToken("x".repeat(40))).status === "NOT_FOUND", "not found");

    const printSource = readFileSync("app/documents/[id]/print/page.tsx", "utf8");
    const pdfSource = readFileSync("app/documents/[id]/pdf/route.ts", "utf8");
    add(checks, "pass output uses two approved copy labels", [printSource, pdfSource].every((source) => source.includes("HOA OFFICE COPY") && source.includes("HOMEOWNER COPY") && !source.includes("MARSHAL'S COPY")), "two-copy A4 labels");
    const receiptCount = await platformPrisma.collection.count({ where: { tenantId: fixture.tenantId, receiptNumber: { not: null }, paymentRequest: { documentRequestId: { in: [requestC.id, requestD.id] } } } });
    add(checks, "document fee receipts are created through Finance collections", receiptCount === 2, String(receiptCount));
  } finally {
    await cleanup({ requestIds, definitionIds, templateSetIds, workflowIds, memberIds, runId }).catch((error) => console.error("Cleanup failed", error));
  }

  let failures = 0;
  for (const [name, passed, detail] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
    if (!passed) failures++;
  }
  await platformPrisma.$disconnect();
  if (failures) throw new Error(`${failures} document workflow executor checks failed.`);
  console.log(`Document workflow executor verification passed (${checks.length} checks).`);
}

async function loadFixture(): Promise<Fixture> {
  const admins = await platformPrisma.user.findMany({ where: { active: true, role: { in: [Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN] } }, orderBy: { tenantId: "asc" } });
  const homeowners = await platformPrisma.homeownerProfile.findMany({ where: { tenantId: { in: admins.map((admin) => admin.tenantId) } }, include: { user: true } });
  const admin = admins.find((item) => homeowners.some((homeowner) => homeowner.tenantId === item.tenantId));
  const homeowner = admin ? homeowners.find((item) => item.tenantId === admin.tenantId) : null;
  if (!admin || !homeowner) throw new Error("A local tenant with both an administrator and homeowner profile is required.");
  const template = defaultTemplateDefinition("Workflow Executor Verification");
  template.sections.header = template.sections.header.filter((block) => block.type !== "logo");
  template.blocks = [...template.sections.header, ...template.sections.body, ...template.sections.footer];
  return { tenantId: admin.tenantId, adminId: admin.id, homeownerId: homeowner.id, template };
}

async function createDefinition(fixture: Fixture, code: string, displayName: string, workflow: { payment: boolean; approval: boolean; approverRole?: Role }, definitionIds: string[], templateSetIds: string[], workflowIds: string[] = [], templateDefinition = fixture.template) {
  const createdWorkflow = workflow.approval
    ? await platformPrisma.documentWorkflowDefinition.create({ data: { tenantId: fixture.tenantId, code: `${code}_WF`, name: `${displayName} Workflow`, approvalMode: DocumentWorkflowApprovalMode.SEQUENTIAL, createdById: fixture.adminId, updatedById: fixture.adminId } })
    : null;
  if (createdWorkflow) {
    workflowIds.push(createdWorkflow.id);
    await platformPrisma.documentWorkflowStep.create({ data: { tenantId: fixture.tenantId, workflowId: createdWorkflow.id, stepOrder: 1, stepType: DocumentWorkflowStepType.APPROVAL, approverRole: workflow.approverRole, required: true, createdById: fixture.adminId, updatedById: fixture.adminId } });
  }
  const definition = await platformPrisma.documentDefinition.create({ data: {
    tenantId: fixture.tenantId,
    code,
    displayName,
    category: "Verification",
    status: DocumentDefinitionStatus.ACTIVE,
    active: true,
    deliveryMode: workflow.payment && workflow.approval ? DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED : workflow.payment ? DocumentDeliveryMode.PAYMENT_REQUIRED : workflow.approval ? DocumentDeliveryMode.APPROVAL_REQUIRED : DocumentDeliveryMode.INSTANT_DOWNLOAD,
    approvalRequired: workflow.approval,
    paymentRequired: workflow.payment,
    paymentBeforeApproval: workflow.payment,
    allowImmediateDownload: !workflow.payment && !workflow.approval,
    requiresAdminReview: workflow.approval,
    homeownerDownloadEnabled: true,
    walkInEnabled: true,
    householdMemberEnabled: true,
    feeAmount: workflow.payment ? "125.00" : "0.00",
    receiptRequired: workflow.payment,
    numberingFormat: "{PREFIX}-{YYYY}-{SEQUENCE:6}",
    workflowDefinitionId: createdWorkflow?.id,
    createdById: fixture.adminId,
    updatedById: fixture.adminId,
  } });
  definitionIds.push(definition.id);
  const set = await platformPrisma.documentTemplateSet.create({ data: { tenantId: fixture.tenantId, definitionId: definition.id, name: `${displayName} Template`, createdById: fixture.adminId, updatedById: fixture.adminId } });
  templateSetIds.push(set.id);
  const version = await platformPrisma.documentTemplateVersion.create({ data: { tenantId: fixture.tenantId, templateSetId: set.id, version: 1, status: DocumentTemplateVersionStatus.PUBLISHED, definitionJson: json(templateDefinition), publishedAt: new Date(), publishedById: fixture.adminId, createdById: fixture.adminId } });
  await platformPrisma.documentDefinition.update({ where: { id: definition.id }, data: { assignedTemplateVersionId: version.id } });
  return { definitionId: definition.id, templateVersionId: version.id };
}

async function createRequest(fixture: Fixture, definitionId: string, templateVersionId: string, runId: string, options: { status?: DocumentRequestStatus; paymentRequired?: boolean; approvalRequired?: boolean; fee?: string; subjectMemberId?: string } = {}) {
  const homeowner = await platformPrisma.homeownerProfile.findUniqueOrThrow({ where: { id: fixture.homeownerId }, include: { user: true } });
  const subjectMember = options.subjectMemberId ? await platformPrisma.householdMember.findUnique({ where: { id: options.subjectMemberId } }) : null;
  return platformPrisma.documentRequest.create({ data: {
    tenantId: fixture.tenantId,
    homeownerId: fixture.homeownerId,
    definitionId,
    definitionVersionSnapshot: 1,
    definitionSnapshot: json({ definitionId, runId }),
    templateVersionIdSnapshot: templateVersionId,
    templateVersionSnapshot: 1,
    templateDefinitionSnapshot: json(fixture.template),
    subjectType: options.subjectMemberId ? DocumentSubjectType.HOUSEHOLD_MEMBER : DocumentSubjectType.SELF,
    subjectMemberId: options.subjectMemberId,
    subjectSnapshot: json(subjectMember ? { fullName: subjectMember.fullName, relationship: subjectMember.relationship, birthDate: subjectMember.birthDate?.toISOString().slice(0, 10) ?? null, civilStatus: subjectMember.civilStatus, nationality: subjectMember.nationality, address: subjectMember.address || homeowner.address, homeownerName: homeowner.user.name, propertyAddress: homeowner.address, block: homeowner.block, lot: homeowner.lot, accountLabel: `Block ${homeowner.block}, Lot ${homeowner.lot}` } : { fullName: homeowner.user.name, relationship: "Homeowner", birthDate: homeowner.birthDate?.toISOString().slice(0, 10) ?? null, civilStatus: homeowner.civilStatus, nationality: homeowner.citizenship, address: homeowner.address, homeownerName: homeowner.user.name, propertyAddress: homeowner.address, block: homeowner.block, lot: homeowner.lot, accountLabel: `Block ${homeowner.block}, Lot ${homeowner.lot}` }),
    requestDataSnapshot: json({ fields: { purpose: `${runId} official workflow verification`, remarks: runId } }),
    deliveryModeSnapshot: options.paymentRequired && options.approvalRequired ? DocumentDeliveryMode.PAYMENT_AND_APPROVAL_REQUIRED : options.paymentRequired ? DocumentDeliveryMode.PAYMENT_REQUIRED : options.approvalRequired ? DocumentDeliveryMode.APPROVAL_REQUIRED : DocumentDeliveryMode.INSTANT_DOWNLOAD,
    approvalRequiredSnapshot: options.approvalRequired ?? false,
    paymentRequiredSnapshot: options.paymentRequired ?? false,
    feeAmountSnapshot: options.fee ?? "0.00",
    origin: DocumentOrigin.HOMEOWNER,
    initiatedById: homeowner.userId,
    status: options.status ?? DocumentRequestStatus.SUBMITTED,
    purpose: `${runId} official workflow verification`,
    remarks: runId,
    validityDate: new Date(Date.now() + 86_400_000 * 30),
  } });
}

async function requestState(id: string) {
  return platformPrisma.documentRequest.findUniqueOrThrow({ where: { id }, include: { versions: true, verificationTokens: true, histories: true } });
}

async function sideEffects(tenantId: string, requestId: string, definitionId: string) {
  const [versions, tokens, counter] = await Promise.all([
    platformPrisma.documentVersion.count({ where: { tenantId, requestId } }),
    platformPrisma.documentVerificationToken.count({ where: { tenantId, requestId } }),
    platformPrisma.documentDefinitionCounter.aggregate({ where: { tenantId, definitionId }, _sum: { lastNumber: true } }),
  ]);
  return { versions, tokens, counter: counter._sum.lastNumber ?? 0 };
}

async function expectError(checks: Check[], name: string, operation: () => Promise<unknown>, expectedCode: string) {
  try {
    await operation();
    add(checks, name, false, "operation unexpectedly succeeded");
  } catch (error) {
    const code = error instanceof DocumentRuntimeError ? error.code : error instanceof Error ? error.message : "UNKNOWN";
    add(checks, name, code.includes(expectedCode), code);
  }
}

async function cleanup(input: { requestIds: string[]; definitionIds: string[]; templateSetIds: string[]; workflowIds: string[]; memberIds: string[]; runId: string }) {
  const collections = await platformPrisma.paymentRequest.findMany({ where: { documentRequestId: { in: input.requestIds } }, select: { collectionId: true } });
  await platformPrisma.paymentRequest.deleteMany({ where: { documentRequestId: { in: input.requestIds } } });
  await platformPrisma.collection.deleteMany({ where: { id: { in: collections.map((item) => item.collectionId).filter(Boolean) as string[] } } });
  await platformPrisma.documentGenerationAttempt.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentVerificationToken.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentVersion.updateMany({ where: { requestId: { in: input.requestIds } }, data: { reissueOfId: null } });
  await platformPrisma.documentVersion.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentRequestEditAudit.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentRequestHistory.deleteMany({ where: { requestId: { in: input.requestIds } } });
  await platformPrisma.documentRequest.deleteMany({ where: { id: { in: input.requestIds } } });
  await platformPrisma.documentDefinitionCounter.deleteMany({ where: { definitionId: { in: input.definitionIds } } });
  await platformPrisma.documentDefinition.updateMany({ where: { id: { in: input.definitionIds } }, data: { assignedTemplateVersionId: null, workflowDefinitionId: null } });
  await platformPrisma.documentTemplateVersion.deleteMany({ where: { templateSetId: { in: input.templateSetIds } } });
  await platformPrisma.documentTemplateSet.deleteMany({ where: { id: { in: input.templateSetIds } } });
  await platformPrisma.documentWorkflowStep.deleteMany({ where: { workflowId: { in: input.workflowIds } } });
  await platformPrisma.documentWorkflowDefinition.deleteMany({ where: { id: { in: input.workflowIds } } });
  await platformPrisma.documentDefinition.deleteMany({ where: { id: { in: input.definitionIds } } });
  await platformPrisma.householdMember.deleteMany({ where: { id: { in: input.memberIds } } });
  await platformPrisma.auditLog.deleteMany({ where: { OR: [{ correlationId: { startsWith: input.runId } }, { entityId: { in: [...input.requestIds, ...input.definitionIds] } }] } });
  await platformPrisma.notificationLog.deleteMany({ where: { entityId: { in: input.requestIds } } });
}

async function cleanupStaleVerificationFixtures() {
  const definitions = await platformPrisma.documentDefinition.findMany({ where: { code: { startsWith: "WF_VERIFY_" } }, select: { id: true } });
  if (!definitions.length) return;
  const definitionIds = definitions.map((item) => item.id);
  const requests = await platformPrisma.documentRequest.findMany({ where: { definitionId: { in: definitionIds } }, select: { id: true } });
  const templateSets = await platformPrisma.documentTemplateSet.findMany({ where: { definitionId: { in: definitionIds } }, select: { id: true } });
  const workflows = await platformPrisma.documentWorkflowDefinition.findMany({ where: { code: { startsWith: "WF_VERIFY_" } }, select: { id: true } });
  const members = await platformPrisma.householdMember.findMany({ where: { fullName: { startsWith: "WF_VERIFY_" } }, select: { id: true } });
  await cleanup({ requestIds: requests.map((item) => item.id), definitionIds, templateSetIds: templateSets.map((item) => item.id), workflowIds: workflows.map((item) => item.id), memberIds: members.map((item) => item.id), runId: "WF_VERIFY_" });
}

function add(checks: Check[], name: string, passed: boolean, detail: string) {
  checks.push([name, passed, detail]);
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function assertSafeLocalDatabase() {
  if (process.env.NODE_ENV === "production") throw new Error("Workflow verification is disabled in production.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Workflow verification requires DATABASE_URL.");
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname.toLowerCase())) {
    throw new Error("Workflow verification may run only against a local MySQL database.");
  }
}

main().catch(async (error) => {
  console.error(error);
  await platformPrisma.$disconnect();
  process.exit(1);
});
