import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  DocumentGenerationMode,
  DocumentGenerationState,
  DocumentIssuedStatus,
  DocumentOutputFormat,
  DocumentRequestStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { platformPrisma } from "@/lib/db";
import { getActiveOrganizationOfficers, organizationOfficerTerm } from "@/lib/organization";
import { getAssociationSettings } from "@/lib/system-settings";
import { resolveEffectiveDocumentDefinition } from "@/lib/services/document-registry";
import { evaluateDocumentPolicies } from "@/lib/services/document-policies";
import { getWorkflowState } from "@/lib/services/document-workflows";
import { resolveDocumentTemplateForGeneration } from "@/lib/services/document-template-runtime";
import { listDocumentPlaceholders, type PlaceholderResolutionContext } from "@/lib/services/document-placeholders";
import { validateTemplateDefinition } from "@/lib/services/document-template-builder";
import { buildDocumentRenderModel } from "@/lib/services/document-render-model";
import { getDocumentRenderer } from "@/lib/services/document-renderers";
import { allocateNextDocumentNumberForGeneration } from "@/lib/services/document-numbering-runtime";
import { prepareDocumentVerificationToken, persistPreparedDocumentVerificationToken } from "@/lib/services/document-verification";
import { claimDocumentGenerationAttempt, updateDocumentGenerationAttempt } from "@/lib/services/document-generation-attempts";
import { recordDocumentGenerationEvent } from "@/lib/services/document-generation-events";
import { safeGenerationSnapshot } from "@/lib/services/document-generation-snapshots";
import { loadGenerationRequest, validateGenerationEligibility, type GenerationRequestRecord } from "@/lib/services/document-generation-eligibility";
import type { DocumentGenerationIssue, DocumentGenerationOptions, DocumentGenerationResult } from "@/lib/services/document-generation-types";
import { notifyDocumentOwner } from "@/lib/services/document-notifications";
import { DocumentRuntimeError } from "@/lib/services/document-runtime-errors";
import { requireDocumentPermission, type DocumentExecutionContext } from "@/lib/services/document-runtime-context";
import { shortDate } from "@/lib/utils";

export async function generateDocument(context: DocumentExecutionContext, requestId: string, options: DocumentGenerationOptions): Promise<DocumentGenerationResult> {
  const correlationId = normalizeCorrelationId(options.correlationId);
  context = { ...context, correlationId };
  const outputFormat = options.outputFormat ?? DocumentOutputFormat.HTML;
  const official = options.mode === DocumentGenerationMode.ISSUE || options.mode === DocumentGenerationMode.REISSUE;
  const validatesOfficialReadiness = official || options.mode === DocumentGenerationMode.VALIDATE;
  requireModePermission(context, options.mode);
  const request = await loadGenerationRequest(context, requestId);
  if (!request) throw new DocumentRuntimeError("NOT_FOUND", "Document request was not found for the authenticated tenant.");
  const automaticHomeownerIssue = options.mode === DocumentGenerationMode.ISSUE
    && context.role === Role.HOMEOWNER
    && request.homeowner.userId === context.authenticatedUserId
    && Boolean(request.definition?.allowImmediateDownload)
    && !request.approvalRequiredSnapshot
    && !request.paymentRequiredSnapshot;
  if (context.role === Role.HOMEOWNER && official) {
    if (!automaticHomeownerIssue) throw new DocumentRuntimeError("PERMISSION_DENIED", "Homeowners cannot issue official documents for this workflow.");
  }
  const idempotencyKey = official ? normalizeIdempotencyKey(options.idempotencyKey) : null;
  let attempt: Awaited<ReturnType<typeof claimDocumentGenerationAttempt>>["attempt"] | null = null;
  try {
    if (official && idempotencyKey) {
      const claim = await claimDocumentGenerationAttempt(context, { requestId, mode: options.mode, idempotencyKey, correlationId });
      attempt = claim.attempt;
      if (claim.replay && claim.attempt.documentVersion) return resultFromVersion(claim.attempt.documentVersion, claim.attempt.id, correlationId, true);
      await recordDocumentGenerationEvent({ context, event: "GENERATION_REQUESTED", requestId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, state: DocumentGenerationState.VALIDATING, metadata: { mode: options.mode, outputFormat } });
      await recordDocumentGenerationEvent({ context, event: "VALIDATION_STARTED", requestId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, state: DocumentGenerationState.VALIDATING });
    }
    const effective = await resolveEffectiveDocumentDefinition(context, { definitionId: request.definitionId ?? undefined });
    const issues = validateGenerationEligibility({ context, request, capabilities: effective.capabilities, mode: options.mode });
    const tenant = await platformPrisma.tenant.findUnique({ where: { id: context.tenantId }, select: { status: true } });
    if (!tenant || tenant.status !== "ACTIVE") issues.push(issue("TENANT_INACTIVE", "AUTHORIZATION", "The issuing tenant is not active.", true));
    const policySummary = request.definitionId ? await evaluateDocumentPolicies(context, request.definitionId, { homeownerId: request.homeownerId, requestId: request.id }) : [];
    for (const result of policySummary) {
      if (result.status === "ERROR" || (result.blocking && result.status !== "PASS")) issues.push(issue("POLICY_BLOCKED", "POLICY", result.summary, true, "Resolve or validly override the blocking policy before issuance.", { policyCode: result.policyCode, policyVersion: result.policyVersion, evaluatorVersion: result.evaluatorVersion }));
    }
    const workflowSummary = request.definition?.workflowDefinitionId
      ? await getWorkflowState(context, request.id)
      : automaticWorkflowState(request);
    if (validatesOfficialReadiness && request.definition?.workflowDefinitionId && !workflowSummary?.completed) issues.push(issue("WORKFLOW_INCOMPLETE", "WORKFLOW", "The configured workflow has not completed.", true, "Complete all required workflow steps before issuance."));
    if (validatesOfficialReadiness && request.approvalRequiredSnapshot && !request.approvedAt && !workflowSummary?.completed) issues.push(issue("APPROVAL_INCOMPLETE", "WORKFLOW", "Required approval has not completed.", true));
    const template = await resolveGenerationTemplate(context, { definitionId: effective.definition.id, mode: options.mode, requestTemplateVersionId: request.templateVersionIdSnapshot, draftTemplateVersionId: options.draftTemplateVersionId });
    const placeholders = await listDocumentPlaceholders(context);
    const officers = await getActiveOrganizationOfficers(context.tenantId);
    const templateValidation = validateTemplateDefinition(template.definitionJson, { allowedPlaceholders: new Set(placeholders.map((item) => item.key)), officerPositions: officers.map((officer) => officer.position), activeOfficerCount: officers.length });
    templateValidation.errors.forEach((message) => issues.push(issue("TEMPLATE_INVALID", "TEMPLATE", message, true, "Repair and publish a valid template version.")));
    const association = await getAssociationSettings(context.tenantId);
    const templateRequiresSignatory = Boolean(record(template.definitionJson).meta && record(record(template.definitionJson).meta).requiresSignatory === true);
    const signatory = request.definition?.signatoryOfficer ?? (templateRequiresSignatory ? null : officers[0] ?? { fullName: "Authorized HOA Officer", position: "Authorized Signatory" });
    if (validatesOfficialReadiness && templateRequiresSignatory && !signatory) issues.push(issue("SIGNATORY_MISSING", "DEFINITION", "A valid authorized signatory is required for official issuance.", true, "Assign an active tenant officer to this document definition."));
    const issueDate = new Date();
    const previewNumber = options.mode === DocumentGenerationMode.PREVIEW ? "PREVIEW" : "PENDING";
    const validationVerificationUrl = validatesOfficialReadiness && effective.capabilities.supportsQRVerification
      ? "https://verification.invalid/pending"
      : null;
    const previewContext = placeholderContext(request, association, signatory, previewNumber, issueDate, validationVerificationUrl, context, officers);
    const previewModel = buildDocumentRenderModel({ templateDefinition: template.definitionJson, title: effective.definition.displayName, documentNumber: previewNumber, issueDate: shortDate(issueDate), validUntil: request.validityDate ? shortDate(request.validityDate) : null, verificationUrl: null, mode: options.mode, placeholderContext: previewContext, placeholderDefinitions: placeholders });
    previewModel.unauthorizedPlaceholders.forEach((key) => issues.push(issue("PLACEHOLDER_UNAUTHORIZED", "PLACEHOLDER", `Placeholder ${key} is not authorized for this generation context.`, true)));
    if (validatesOfficialReadiness) previewModel.unresolvedPlaceholders.forEach((key) => issues.push(issue("PLACEHOLDER_UNRESOLVED", "PLACEHOLDER", `Placeholder ${key} could not be resolved.`, true, "Provide the required request data or remove the placeholder from the published template.")));
    if (validatesOfficialReadiness) (previewModel.officerListValidationErrors ?? []).forEach((message) => issues.push(issue("OFFICER_LIST_INVALID", "TEMPLATE", message, true, "Configure an active same-tenant officer list with a valid term and role filter.")));
    const renderer = getDocumentRenderer(outputFormat);
    renderer.validate(previewModel).forEach((message) => issues.push(issue("RENDER_VALIDATION_FAILED", "RENDERER", message, true)));
    const blocking = issues.some((item) => item.blocking);
    if (options.mode === DocumentGenerationMode.VALIDATE || (official && blocking)) {
      if (attempt) {
        await updateDocumentGenerationAttempt(context, attempt.id, { state: DocumentGenerationState.BLOCKED, completedAt: new Date(), failureCode: issues.find((item) => item.blocking)?.code ?? "VALIDATION_BLOCKED", failureMessage: safeIssueMessage(issues), metadata: safeGenerationSnapshot({ issues }) });
        await recordDocumentGenerationEvent({ context, event: "VALIDATION_BLOCKED", requestId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, state: DocumentGenerationState.BLOCKED, metadata: { issueCodes: issues.map((item) => item.code) } });
      }
      return emptyResult({ mode: options.mode, state: blocking ? DocumentGenerationState.BLOCKED : DocumentGenerationState.READY, request, correlationId, attemptId: attempt?.id ?? null, outputFormat, templateVersionId: template.id, templateVersion: template.version, issues, warnings: previewModel.warnings, policySummary, workflowSummary });
    }
    if (options.mode === DocumentGenerationMode.PREVIEW) {
      const rendered = await renderer.render(previewModel);
      await recordDocumentGenerationEvent({ context, event: "RENDER_COMPLETED", requestId, state: DocumentGenerationState.GENERATED, metadata: { mode: options.mode, renderer: rendered.rendererName, preview: true } });
      return { ...emptyResult({ mode: options.mode, state: DocumentGenerationState.GENERATED, request, correlationId, attemptId: null, outputFormat, templateVersionId: template.id, templateVersion: template.version, issues, warnings: [...previewModel.warnings, ...rendered.warnings], policySummary, workflowSummary }), contentType: rendered.contentType, content: rendered.content, rendererName: rendered.rendererName, rendererVersion: rendered.rendererVersion };
    }
    if (!attempt || !idempotencyKey) throw new DocumentRuntimeError("INTERNAL_GENERATION_FAILURE", "Official generation attempt was not initialized.");
    if (options.mode === DocumentGenerationMode.REISSUE && !options.reason?.trim()) throw new DocumentRuntimeError("VALIDATION_FAILED", "A reason is required for document reissue.");
    const sourceVersion = options.mode === DocumentGenerationMode.REISSUE ? resolveReissueSource(request, options.reissueOfVersionId) : null;
    const verification = effective.capabilities.supportsQRVerification ? prepareDocumentVerificationToken() : null;
    const final = await platformPrisma.$transaction(async (tx) => {
      const fresh = await tx.documentRequest.findFirst({ where: { tenantId: context.tenantId, id: request.id }, select: { id: true, tenantId: true, status: true, currentVersion: true, documentNumber: true } });
      if (!fresh) throw new DocumentRuntimeError("NOT_FOUND", "Document request disappeared before issuance.");
      if (blockedRequestStates.has(fresh.status)) throw new DocumentRuntimeError("INVALID_STATE", "Request state changed and no longer permits issuance.");
      if (options.mode === DocumentGenerationMode.ISSUE && fresh.currentVersion > 0) throw new DocumentRuntimeError("DUPLICATE_ISSUANCE", "This request was already issued by another operation.");
      await updateDocumentGenerationAttempt(context, attempt!.id, { state: DocumentGenerationState.RENDERING, rendererName: renderer.name, rendererVersion: renderer.version }, tx);
      await recordDocumentGenerationEvent({ context, event: "RENDER_STARTED", requestId, attemptId: attempt!.id, attemptNumber: attempt!.attemptNumber, state: DocumentGenerationState.RENDERING, client: tx });
      const documentNumber = await allocateGenerationNumber(context, effective.definition.id, tx, issueDate);
      await recordDocumentGenerationEvent({ context, event: "NUMBER_ALLOCATED", requestId, attemptId: attempt!.id, attemptNumber: attempt!.attemptNumber, metadata: { documentNumber }, client: tx });
      const finalContext = placeholderContext(request, association, signatory, documentNumber, issueDate, verification?.url ?? null, context, officers);
      const model = buildDocumentRenderModel({ templateDefinition: template.definitionJson, title: effective.definition.displayName, documentNumber, issueDate: shortDate(issueDate), validUntil: request.validityDate ? shortDate(request.validityDate) : null, verificationUrl: verification?.url ?? null, mode: options.mode, placeholderContext: finalContext, placeholderDefinitions: placeholders });
      if (model.unresolvedPlaceholders.length) throw new DocumentRuntimeError("PLACEHOLDER_UNRESOLVED", "Required placeholders could not be resolved.", { placeholders: model.unresolvedPlaceholders });
      if (model.unauthorizedPlaceholders.length) throw new DocumentRuntimeError("PLACEHOLDER_UNAUTHORIZED", "The generation context is not authorized for required placeholders.", { placeholders: model.unauthorizedPlaceholders });
      if ((model.officerListValidationErrors ?? []).length) throw new DocumentRuntimeError("TEMPLATE_INVALID", "The HOA officer list could not be resolved for the authenticated tenant.", { errors: model.officerListValidationErrors });
      const rendered = await renderer.render(model);
      if (!rendered.content.trim()) throw new DocumentRuntimeError("RENDER_FAILED", "Renderer returned an empty document.");
      const contentHash = createHash("sha256").update(rendered.content, "utf8").digest("hex");
      const versionNumber = fresh.currentVersion + 1;
      const immediateRelease = !effective.definition.releaseRequired && effective.definition.homeownerDownloadEnabled;
      const legacyVerificationCode = randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
      const version = await tx.documentVersion.create({ data: { tenantId: context.tenantId, requestId: request.id, definitionId: effective.definition.id, templateVersionId: template.id, version: versionNumber, documentNumber, verificationCode: legacyVerificationCode, templateVersion: template.version, templateSnapshot: JSON.stringify(template.definitionJson), generatedContent: rendered.content, requestSnapshot: safeGenerationSnapshot({ requestDataSnapshot: request.requestDataSnapshot, reviewedDataSnapshot: request.reviewedDataSnapshot, subjectSnapshot: request.subjectSnapshot, property: { block: request.homeowner.block, lot: request.homeowner.lot, address: request.homeowner.address } }), definitionSnapshot: safeGenerationSnapshot(definitionSnapshot(effective.definition)), templateDefinitionSnapshot: safeGenerationSnapshot(template.definitionJson), generatedById: context.authenticatedUserId, issuedStatus: immediateRelease ? DocumentIssuedStatus.RELEASED : DocumentIssuedStatus.ISSUED, issuedAt: issueDate, releasedAt: immediateRelease ? issueDate : null, releasedById: immediateRelease ? context.authenticatedUserId : null, contentHash, reissueOfId: sourceVersion?.id ?? null, reason: options.reason?.trim() || (options.mode === DocumentGenerationMode.REISSUE ? "Authorized document reissue." : "Configuration-driven document issuance."), generationMode: options.mode, outputFormat: rendered.outputFormat, contentType: rendered.contentType, outputSize: rendered.outputSize, rendererName: rendered.rendererName, rendererVersion: rendered.rendererVersion, capabilitiesSnapshot: safeGenerationSnapshot(effective.capabilities), policySnapshot: safeGenerationSnapshot(policySummary), workflowSnapshot: workflowSummary ? safeGenerationSnapshot(workflowSummary) : Prisma.JsonNull, resolvedDataSnapshot: safeGenerationSnapshot({ resolvedValues: model.resolvedValues, officerListSnapshot: model.officerListSnapshot }), generationCorrelationId: correlationId, idempotencyKey, templateSetIdSnapshot: template.templateSetId, sourceTemplateVersionIdSnapshot: template.sourceVersionId } });
      if (verification) {
        await persistPreparedDocumentVerificationToken(context, { requestId: request.id, documentVersionId: version.id, definitionId: effective.definition.id, expiresAt: request.validityDate ?? undefined, prepared: verification }, tx);
        await recordDocumentGenerationEvent({ context, event: "VERIFICATION_CREATED", requestId, attemptId: attempt!.id, documentVersionId: version.id, attemptNumber: attempt!.attemptNumber, client: tx });
      }
      const requestStatus = DocumentRequestStatus.ISSUED;
      await tx.documentRequest.update({ where: { id: request.id }, data: { status: requestStatus, documentNumber, generatedAt: issueDate, issuedAt: issueDate, readyForDownloadAt: immediateRelease ? issueDate : null, issueDate, templateVersion: template.version, templateVersionSnapshot: template.version, templateVersionIdSnapshot: template.id, templateDefinitionSnapshot: safeGenerationSnapshot(template.definitionJson), templateSnapshot: JSON.stringify(template.definitionJson), generatedContent: rendered.content, verificationCode: legacyVerificationCode, currentVersion: versionNumber, associationSnapshot: safeGenerationSnapshot(association), homeownerSnapshot: safeGenerationSnapshot(request.subjectSnapshot), organizationSnapshot: safeGenerationSnapshot(officers), ...(automaticHomeownerIssue ? { processedById: null, processedOfficerSnapshot: safeGenerationSnapshot({ processorType: "SYSTEM", name: "HOAHub automatic processing", processedAt: issueDate }) } : { processedById: context.authenticatedUserId }), ...(!request.approvalRequiredSnapshot || request.approvedById ? {} : { approvedById: context.authenticatedUserId, approvedAt: request.approvedAt ?? issueDate }) } });
      await tx.documentRequestHistory.create({ data: { tenantId: context.tenantId, requestId: request.id, status: requestStatus, actorId: automaticHomeownerIssue ? null : context.authenticatedUserId, note: automaticHomeownerIssue ? `HOAHub automatic processing issued ${documentNumber} and released it for download.` : immediateRelease ? `Issued ${documentNumber} and made ready for download.` : `Issued ${documentNumber}; office release is pending.` } });
      const attemptState = options.mode === DocumentGenerationMode.REISSUE ? DocumentGenerationState.REISSUED : immediateRelease ? DocumentGenerationState.RELEASED : DocumentGenerationState.RELEASE_PENDING;
      await updateDocumentGenerationAttempt(context, attempt!.id, { state: attemptState, completedAt: issueDate, documentVersion: { connect: { id: version.id } }, rendererName: rendered.rendererName, rendererVersion: rendered.rendererVersion, metadata: safeGenerationSnapshot({ contentHash, outputSize: rendered.outputSize, documentNumber }) }, tx);
      await recordDocumentGenerationEvent({ context, event: "RENDER_COMPLETED", requestId, attemptId: attempt!.id, documentVersionId: version.id, attemptNumber: attempt!.attemptNumber, state: DocumentGenerationState.GENERATED, metadata: { contentHash, outputSize: rendered.outputSize }, client: tx });
      await recordDocumentGenerationEvent({ context, event: options.mode === DocumentGenerationMode.REISSUE ? "DOCUMENT_REISSUED" : "DOCUMENT_ISSUED", requestId, attemptId: attempt!.id, documentVersionId: version.id, attemptNumber: attempt!.attemptNumber, state: attemptState, metadata: { documentNumber, released: immediateRelease }, client: tx });
      if (!immediateRelease) await recordDocumentGenerationEvent({ context, event: "RELEASE_PENDING", requestId, attemptId: attempt!.id, documentVersionId: version.id, attemptNumber: attempt!.attemptNumber, state: DocumentGenerationState.RELEASE_PENDING, client: tx });
      return { version, rendered, documentNumber, requestStatus, contentHash, verificationUrl: verification?.url ?? null, attemptState };
    }, { timeout: 15000 });
    if (final.attemptState === DocumentGenerationState.RELEASED) await notifyDocumentOwner(context, request.homeowner.userId, "READY_FOR_DOWNLOAD", "Document ready for download", `${effective.definition.displayName} ${final.documentNumber} is ready for download.`, request.id, { documentNumber: final.documentNumber }, `READY_FOR_DOWNLOAD:DocumentVersion:${final.version.id}`);
    return { mode: options.mode, state: final.attemptState, requestId: request.id, requestStatus: final.requestStatus, correlationId, idempotentReplay: false, attemptId: attempt.id, documentVersionId: final.version.id, documentNumber: final.documentNumber, verificationUrl: final.verificationUrl, outputFormat: final.rendered.outputFormat, contentType: final.rendered.contentType, content: final.rendered.content, contentHash: final.contentHash, rendererName: final.rendered.rendererName, rendererVersion: final.rendered.rendererVersion, templateVersionId: template.id, templateVersion: template.version, issues, warnings: [...previewModel.warnings, ...final.rendered.warnings], policySummary, workflowSummary };
  } catch (error) {
    if (attempt && !isConcurrency(error)) {
      const runtime = asRuntimeError(error);
      await updateDocumentGenerationAttempt(context, attempt.id, { state: DocumentGenerationState.FAILED, completedAt: new Date(), failureCode: runtime.code, failureMessage: runtime.message }).catch(() => undefined);
      await recordDocumentGenerationEvent({ context, event: "GENERATION_FAILED", requestId, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, state: DocumentGenerationState.FAILED, reason: runtime.message, metadata: { code: runtime.code, correlationId } }).catch(() => undefined);
    }
    throw asRuntimeError(error);
  }
}

async function resolveGenerationTemplate(
  context: DocumentExecutionContext,
  input: Parameters<typeof resolveDocumentTemplateForGeneration>[1],
) {
  try {
    return await resolveDocumentTemplateForGeneration(context, input);
  } catch (error) {
    if (error instanceof DocumentRuntimeError) throw error;
    throw new DocumentRuntimeError(
      "TEMPLATE_UNAVAILABLE",
      error instanceof Error ? error.message : "No valid template version is available.",
    );
  }
}

async function allocateGenerationNumber(
  context: DocumentExecutionContext,
  definitionId: string,
  tx: Prisma.TransactionClient,
  issueDate: Date,
) {
  try {
    return await allocateNextDocumentNumberForGeneration(context, definitionId, tx, issueDate);
  } catch (error) {
    if (error instanceof DocumentRuntimeError) throw error;
    throw new DocumentRuntimeError(
      "NUMBER_ALLOCATION_FAILED",
      error instanceof Error ? error.message : "Document number allocation failed.",
    );
  }
}

const blockedRequestStates = new Set<DocumentRequestStatus>([
  DocumentRequestStatus.CANCELLED,
  DocumentRequestStatus.REJECTED,
]);

function placeholderContext(request: GenerationRequestRecord, association: Awaited<ReturnType<typeof getAssociationSettings>>, signatory: { fullName: string; position: string } | null, documentNumber: string, issueDate: Date, verificationUrl: string | null, context: DocumentExecutionContext, officers: Awaited<ReturnType<typeof getActiveOrganizationOfficers>>): PlaceholderResolutionContext {
  const subject = record(request.subjectSnapshot);
  const requestData = record(request.reviewedDataSnapshot ?? request.requestDataSnapshot);
  const fields = record(requestData.fields ?? requestData);
  const subjectBirthDate = dateValue(subject.birthDate);
  const requestPurpose = text(fields.purpose) || request.purpose || "official purposes";
  return {
    tenantId: context.tenantId,
    tenant: { name: association.name, address: association.address, tin: association.tinNumber, secRegistration: association.secRegistrationNumber, contactNumber: association.contactNumber, email: association.email, logo: association.logoUrl },
    document: { number: documentNumber, title: request.definition?.displayName ?? "Official HOA Document", issueDate: shortDate(issueDate), issuePlace: association.address || association.name, status: documentNumber === "PREVIEW" ? "Preview" : "Issued", validUntil: request.validityDate ? shortDate(request.validityDate) : undefined },
    subject: { fullName: text(subject.fullName) || request.homeowner.user.name, relationship: text(subject.relationship) || "Homeowner", address: text(subject.address) || request.homeowner.address, birthDate: subjectBirthDate ? shortDate(subjectBirthDate) : text(subject.birthDate), civilStatus: text(subject.civilStatus) || request.homeowner.civilStatus || undefined, nationality: text(subject.nationality) || request.homeowner.citizenship || undefined, status: request.homeowner.occupancyStatus || request.homeowner.propertyType || undefined, residencyStartDate: request.homeowner.residencyDate ? shortDate(request.homeowner.residencyDate) : undefined, age: subjectBirthDate ? String(ageAt(subjectBirthDate, issueDate)) : request.homeowner.birthDate ? String(ageAt(request.homeowner.birthDate, issueDate)) : undefined, occupation: request.homeowner.occupation || undefined, contactNumber: request.homeowner.phone || undefined, phase: request.homeowner.phase || undefined, propertyType: request.homeowner.propertyType || undefined, occupancyStatus: request.homeowner.occupancyStatus || undefined },
    property: { block: text(subject.block) || request.homeowner.block, lot: text(subject.lot) || request.homeowner.lot, address: text(subject.propertyAddress) || request.homeowner.address, accountLabel: text(subject.accountLabel) || `Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`, phase: request.homeowner.phase || undefined, subdivision: association.name },
    request: { purpose: requestPurpose, remarks: text(fields.remarks) || request.remarks || undefined, copies: request.numberOfCopies, requestedAt: shortDate(request.requestedAt) },
    signatory: { name: signatory?.fullName, position: signatory?.position },
    verification: { url: verificationUrl ?? undefined, code: verificationUrl ? "Scan to verify" : undefined },
    system: { generatedAt: shortDate(issueDate), platformName: "HOAHub" },
    organization: { tenantId: context.tenantId, term: organizationOfficerTerm(officers), officers: officers.map((officer) => ({ id: officer.id, fullName: officer.fullName, position: officer.position, displayOrder: officer.displayOrder })) },
    permissions: new Set(context.role === Role.HOMEOWNER ? ["DOCUMENT_PLACEHOLDER:PERSONAL"] : ["DOCUMENT_PLACEHOLDER:PERSONAL", "DOCUMENT_PLACEHOLDER:FINANCIAL", "DOCUMENT_PLACEHOLDER:VIOLATION"]),
  };
}

function definitionSnapshot(definition: { id: string; code: string; displayName: string; version: number; deliveryMode: string; approvalRequired: boolean; paymentRequired: boolean; releaseRequired: boolean; outstandingBalancePolicy: string; numberingFormat: string; qrEnabled: boolean }) {
  return { id: definition.id, code: definition.code, displayName: definition.displayName, version: definition.version, deliveryMode: definition.deliveryMode, approvalRequired: definition.approvalRequired, paymentRequired: definition.paymentRequired, releaseRequired: definition.releaseRequired, outstandingBalancePolicy: definition.outstandingBalancePolicy, numberingFormat: definition.numberingFormat, qrEnabled: definition.qrEnabled };
}

function automaticWorkflowState(request: GenerationRequestRecord) {
  if (!request.definition?.allowImmediateDownload || request.approvalRequiredSnapshot || request.paymentRequiredSnapshot) return null;
  return {
    workflowId: "HOAHUB_AUTOMATIC_INSTANT",
    workflowVersion: request.definition.version,
    completed: true,
    currentStepIds: [] as string[],
    timeline: [{ stepId: null, decision: "APPROVED", status: request.status, note: "Validated for automatic instant processing.", createdAt: request.requestedAt }],
  };
}

function requireModePermission(context: DocumentExecutionContext, mode: DocumentGenerationMode) {
  if (mode === DocumentGenerationMode.PREVIEW) return requireDocumentPermission(context, "PREVIEW_DOCUMENT");
  if (mode === DocumentGenerationMode.VALIDATE) return requireDocumentPermission(context, "VALIDATE_GENERATION");
  if (mode === DocumentGenerationMode.REISSUE) return requireDocumentPermission(context, "REISSUE_DOCUMENT");
  if (context.role !== Role.HOMEOWNER) requireDocumentPermission(context, "ISSUE_DOCUMENT");
}

function normalizeIdempotencyKey(value?: string) {
  const key = value?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new DocumentRuntimeError("VALIDATION_FAILED", "ISSUE and REISSUE require an idempotency key containing 8 to 128 safe characters.");
  return key;
}

function normalizeCorrelationId(value?: string) {
  const correlationId = value?.trim() || randomUUID();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(correlationId) ? correlationId : randomUUID();
}

function resolveReissueSource(request: GenerationRequestRecord, requestedId?: string) {
  const source = requestedId ? request.versions.find((version) => version.id === requestedId) : request.versions[0];
  if (!source || source.tenantId !== request.tenantId) throw new DocumentRuntimeError("NOT_FOUND", "The source issued document was not found for this request and tenant.");
  if (source.issuedStatus === DocumentIssuedStatus.REVOKED) throw new DocumentRuntimeError("INVALID_STATE", "A revoked document cannot be used as the direct reissue source.");
  return source;
}

function issue(code: string, domain: DocumentGenerationIssue["domain"], message: string, blocking: boolean, remediation?: string, metadata?: DocumentGenerationIssue["metadata"]): DocumentGenerationIssue {
  return { code, domain, severity: blocking ? "ERROR" : "WARNING", blocking, message, remediation, metadata };
}

function emptyResult(input: { mode: DocumentGenerationMode; state: DocumentGenerationState; request: GenerationRequestRecord; correlationId: string; attemptId: string | null; outputFormat: DocumentOutputFormat; templateVersionId: string | null; templateVersion: number | null; issues: DocumentGenerationIssue[]; warnings: string[]; policySummary: unknown[]; workflowSummary: unknown }): DocumentGenerationResult {
  return { mode: input.mode, state: input.state, requestId: input.request.id, requestStatus: input.request.status, correlationId: input.correlationId, idempotentReplay: false, attemptId: input.attemptId, documentVersionId: null, documentNumber: null, verificationUrl: null, outputFormat: input.outputFormat, contentType: null, content: null, contentHash: null, rendererName: null, rendererVersion: null, templateVersionId: input.templateVersionId, templateVersion: input.templateVersion, issues: input.issues, warnings: input.warnings, policySummary: input.policySummary, workflowSummary: input.workflowSummary };
}

function resultFromVersion(version: { id: string; requestId: string; generationMode: DocumentGenerationMode; issuedStatus: DocumentIssuedStatus; documentNumber: string; generatedContent: string; outputFormat: DocumentOutputFormat; contentType: string; contentHash: string | null; rendererName: string | null; rendererVersion: string | null; templateVersionId: string | null; templateVersion: number }, attemptId: string, correlationId: string, replay: boolean): DocumentGenerationResult {
  const state = version.generationMode === DocumentGenerationMode.REISSUE ? DocumentGenerationState.REISSUED : version.issuedStatus === DocumentIssuedStatus.RELEASED ? DocumentGenerationState.RELEASED : DocumentGenerationState.RELEASE_PENDING;
  return { mode: version.generationMode, state, requestId: version.requestId, requestStatus: DocumentRequestStatus.ISSUED, correlationId, idempotentReplay: replay, attemptId, documentVersionId: version.id, documentNumber: version.documentNumber, verificationUrl: null, outputFormat: version.outputFormat, contentType: version.contentType, content: version.generatedContent, contentHash: version.contentHash, rendererName: version.rendererName, rendererVersion: version.rendererVersion, templateVersionId: version.templateVersionId, templateVersion: version.templateVersion, issues: [], warnings: [], policySummary: [], workflowSummary: null };
}

function safeIssueMessage(issues: DocumentGenerationIssue[]) {
  return issues.filter((item) => item.blocking).map((item) => item.message).join(" ").slice(0, 1000);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageAt(birthDate: Date, at: Date) {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  if (at.getUTCMonth() < birthDate.getUTCMonth() || (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return Math.max(0, age);
}

function isConcurrency(error: unknown) {
  return error instanceof DocumentRuntimeError && error.code === "CONCURRENCY_CONFLICT";
}

function asRuntimeError(error: unknown) {
  if (error instanceof DocumentRuntimeError) return error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return new DocumentRuntimeError("CONCURRENCY_CONFLICT", "A concurrent issuance completed or reserved the same unique document state.");
  return new DocumentRuntimeError("INTERNAL_GENERATION_FAILURE", error instanceof Error ? error.message : "Document generation failed.");
}
