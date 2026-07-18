"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DocumentDefinitionStatus, DocumentDeliveryMode, DocumentFieldType, DocumentOutstandingBalancePolicy, DocumentRequestStatus, DocumentSequenceScope, DocumentSubjectType, DocumentTemplateVersionStatus, DocumentType, NotificationType, Prisma, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { platformPrisma, prisma } from "@/lib/db";
import { requireDocumentTemplateAdmin } from "@/lib/document-template-admin";
import { getAssociationSettings } from "@/lib/system-settings";
import { asJson, getActiveOrganizationOfficers, officerSnapshot } from "@/lib/organization";
import { allocateDefinitionDocumentNumber, allocateDocumentNumber, documentTypeLabel, documentTypeOptions, renderDocumentTemplate } from "@/lib/services/documents";
import { buildSubjectSnapshot, canGenerateWithoutPayment, documentConfigurationStatus, legacyRequestFields, needsTemplate, parseConfiguredFields, requestDataSnapshotJson, statusForConfiguration, subjectSnapshotJson } from "@/lib/services/document-workflow";
import { defaultNumberingFormat, evaluateDefinitionCompleteness, validateNumberingFormat, workflowFieldsForPreset } from "@/lib/services/document-definitions";
import { balancePolicyLockMessage, canOverrideDocumentBalancePolicy, getQualifyingHomeownerBalance, normalizeOutstandingBalancePolicy, policyForDocumentRequest } from "@/lib/services/document-balance-policy";
import { defaultTemplateDefinition, documentTemplateBlockTypes, documentTemplateSchemaVersion, normalizeTemplateDefinition, renderTemplateDefinitionText, validateTemplateDefinition, type AllowedDocumentPlaceholder, type DocumentTemplateBlock, type DocumentTemplateBlockType } from "@/lib/services/document-template-builder";
import { tenantUploadDirectory } from "@/lib/storage";
import { money, shortDate } from "@/lib/utils";
import { sendEmailNotification } from "@/lib/services/notifications";

export async function submitDocumentRequestAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) redirect("/portal/documents?error=Homeowner%20profile%20not%20found.");
  const definitionId = clean(formData.get("definitionId"));
  const configurationId = String(formData.get("configurationId") || "");
  const subjectType = String(formData.get("subjectType") || DocumentSubjectType.SELF) === DocumentSubjectType.HOUSEHOLD_MEMBER ? DocumentSubjectType.HOUSEHOLD_MEMBER : DocumentSubjectType.SELF;
  const subjectMemberId = clean(formData.get("subjectMemberId"));
  const numberOfCopies = Math.max(1, Math.min(25, Number(formData.get("numberOfCopies")) || 1));
  const fail = (message: string): never => redirect(`/portal/documents?error=${encodeURIComponent(message)}`);
  const [homeowner, config] = await Promise.all([
    prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId: user.tenantId }, include: { user: true } }),
    definitionId
      ? prisma.documentTypeConfiguration.findFirst({
          where: { tenantId: user.tenantId, definitionId, active: true },
          include: { fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, template: true },
        })
      : prisma.documentTypeConfiguration.findFirst({
          where: { id: configurationId, tenantId: user.tenantId, active: true },
          include: { fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, template: true },
        }),
  ]);
  const definition = definitionId ? await prisma.documentDefinition.findFirst({
    where: { id: definitionId, tenantId: user.tenantId, active: true, status: DocumentDefinitionStatus.ACTIVE, archivedAt: null },
    include: { fields: { where: { active: true }, orderBy: [{ displayOrder: "asc" }, { label: "asc" }] }, assignedTemplateVersion: { include: { templateSet: true } } },
  }) : null;
  if (!homeowner || (!config && !definition)) fail(!homeowner ? "Homeowner profile not found." : "Select an active document type.");
  const homeownerRecord = homeowner!;
  const configRecord = config;
  const definitionRecord = definition!;
  const maxCopies = definitionRecord?.maxCopies ?? configRecord!.maxCopies;
  if (numberOfCopies > maxCopies) fail(`This document allows up to ${maxCopies} copy${maxCopies === 1 ? "" : "ies"} per request.`);
  if (definitionRecord) {
    const availability = evaluateDefinitionCompleteness(definitionRecord);
    if (!availability.requestable) fail(`This document type is currently unavailable: ${availability.errors[0] || availability.status}.`);
  } else {
    const availability = documentConfigurationStatus(configRecord!);
    if (!availability.requestable) fail(`This document type is currently unavailable: ${availability.label}.`);
  }
  const workflowRecord = definitionRecord ?? configRecord!;
  if (!canGenerateWithoutPayment(workflowRecord) && workflowRecord.deliveryMode === DocumentDeliveryMode.INSTANT_DOWNLOAD) fail("This paid document requires payment confirmation before download.");

  const member = subjectType === DocumentSubjectType.HOUSEHOLD_MEMBER
    ? await prisma.householdMember.findFirst({ where: { id: subjectMemberId, tenantId: user.tenantId, homeownerId, active: true } })
    : null;
  if (subjectType === DocumentSubjectType.HOUSEHOLD_MEMBER && !member) fail("Select a registered household or family member linked to your account.");
  const parsed = parseConfiguredFields(formData, definitionRecord?.fields ?? configRecord!.fields);
  if (parsed.errors.length) fail(parsed.errors[0]);
  const legacy = legacyRequestFields(parsed.values);
  const purpose = legacy.purpose?.trim();
  const remarks = legacy.remarks?.trim();
  const scheduledDate = optionalDateFromString(legacy.scheduledDate);
  const legacyType = definitionRecord?.legacyType ?? configRecord?.type ?? null;
  const requiresLegacyPurpose = !definitionRecord || Boolean(legacyType);
  if (requiresLegacyPurpose && (!purpose || purpose.length < 3)) fail("Enter the purpose of the request.");
  if (purpose && purpose.length < 3) fail("Purpose must be at least 3 characters.");
  const purposeValue = purpose || null;
  if ((purposeValue?.length ?? 0) > 500 || (remarks?.length ?? 0) > 1000) fail("Request details are too long.");
  if (scheduledDate && scheduledDate < todayUtc()) fail("Pass and validity dates must be today or later.");
  if (legacyType === DocumentType.MOVE_IN_OUT_PASS && legacy.passType && !["MOVE_IN", "MOVE_OUT"].includes(legacy.passType)) fail("Select Move In or Move Out.");

  const outstandingBalance = await getQualifyingHomeownerBalance(user.tenantId, homeownerId);
  const balancePolicy = definitionRecord?.outstandingBalancePolicy ?? DocumentOutstandingBalancePolicy.BLOCK_DOWNLOAD;
  if (balancePolicy === DocumentOutstandingBalancePolicy.BLOCK_REQUEST && outstandingBalance > 0) fail(balancePolicyLockMessage(balancePolicy, outstandingBalance));
  const status = statusForConfiguration(workflowRecord);
  const subjectSnapshot = buildSubjectSnapshot({ subjectType, homeowner: homeownerRecord, member });
  const requestDataSnapshot = definitionRecord
    ? asJson({ definitionId: definitionRecord.id, definitionVersion: definitionRecord.version, code: definitionRecord.code, displayName: definitionRecord.displayName, legacyType: definitionRecord.legacyType, fields: parsed.values, numberOfCopies })
    : requestDataSnapshotJson(configRecord!, parsed.values, numberOfCopies);
  const duplicate = await prisma.documentRequest.findFirst({
    where: { tenantId: user.tenantId, homeownerId, ...(definitionRecord ? { definitionId: definitionRecord.id } : { configurationId: configRecord!.id }), subjectType, subjectMemberId: member?.id ?? null, purpose: purposeValue, requestedAt: { gte: new Date(Date.now() - 15000) }, archivedAt: null },
    orderBy: { requestedAt: "desc" },
  });
  if (duplicate) redirect(`/portal/documents?success=submitted&message=${encodeURIComponent("Your recent document request is already recorded.")}`);

  const request = await prisma.documentRequest.create({
    data: {
      tenantId: user.tenantId, homeownerId, type: legacyType, configurationId: configRecord?.id, configurationVersion: configRecord?.version,
      definitionId: definitionRecord?.id, definitionVersionSnapshot: definitionRecord?.version,
      definitionSnapshot: definitionRecord ? asJson({ id: definitionRecord.id, code: definitionRecord.code, displayName: definitionRecord.displayName, version: definitionRecord.version, legacyType: definitionRecord.legacyType, deliveryMode: definitionRecord.deliveryMode, approvalRequired: definitionRecord.approvalRequired, paymentRequired: definitionRecord.paymentRequired, feeAmount: String(definitionRecord.feeAmount), numberingFormat: definitionRecord.numberingFormat, outstandingBalancePolicy: definitionRecord.outstandingBalancePolicy }) : undefined,
      templateVersionIdSnapshot: definitionRecord?.assignedTemplateVersion?.id, templateDefinitionSnapshot: definitionRecord?.assignedTemplateVersion?.definitionJson ?? undefined,
      templateIdSnapshot: configRecord?.template?.id, templateVersionSnapshot: configRecord?.template?.version, subjectType, subjectMemberId: member?.id,
      subjectSnapshot: subjectSnapshotJson(subjectSnapshot), requestDataSnapshot, deliveryModeSnapshot: workflowRecord.deliveryMode,
      approvalRequiredSnapshot: workflowRecord.approvalRequired || workflowRecord.requiresAdminReview, paymentRequiredSnapshot: workflowRecord.paymentRequired,
      feeAmountSnapshot: workflowRecord.feeAmount, numberOfCopies, purpose: purposeValue, remarks, scheduledDate, startTime: legacy.startTime, endTime: legacy.endTime,
      passType: legacy.passType, origin: "HOMEOWNER", initiatedById: user.id, vehicleDetails: legacy.vehicleDetails, partyName: legacy.partyName,
      contractorDetails: legacy.contractorDetails, representativeName: legacy.representativeName, propertyDetails: legacy.propertyDetails || homeownerRecord.address,
      outstandingBalanceAtRequest: outstandingBalance,
      status,
      histories: { create: { tenantId: user.tenantId, status, actorId: user.id, note: requestStatusNote(status, outstandingBalance) } },
    },
    include: { homeowner: { include: { user: true } }, configuration: { include: { template: true } } },
  });
  if (status === DocumentRequestStatus.READY_FOR_DOWNLOAD && (configRecord?.template?.active || definitionRecord?.assignedTemplateVersion)) {
    await generateDocumentForRequest(request.id, user.id, "Instant document generated after valid homeowner submission.");
  }
  await prisma.auditLog.create({ data: { actorId: user.id, module: "DOCUMENTS", action: "SUBMIT_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: request.id, metadata: { type: legacyType, configurationId: configRecord?.id, definitionId: definitionRecord?.id, subjectType, subjectMemberId: member?.id, purpose: purposeValue, outstandingBalance, deliveryMode: workflowRecord.deliveryMode, paymentRequired: workflowRecord.paymentRequired } } });
  revalidateDocumentPages(request.id);
  redirect(`/portal/documents?success=submitted&message=${encodeURIComponent(status === DocumentRequestStatus.READY_FOR_DOWNLOAD ? "Document request submitted and prepared for download." : "Document request submitted successfully.")}`);
}

export async function processDocumentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const operation = String(formData.get("operation") || "");
  const requestedReturnPath = String(formData.get("returnTo") || "");
  const returnPath = /^\/admin\/documents\/[A-Za-z0-9_-]+$/.test(requestedReturnPath) ? requestedReturnPath : "/admin/documents";
  const fail = (message: string): never => redirect(`${returnPath}?error=${encodeURIComponent(message)}`);
  const adminRemarks = clean(formData.get("adminRemarks"));
  const submittedValidityDate = optionalDate(formData.get("validityDate"));
  const request = await prisma.documentRequest.findFirst({ where: { id, tenantId: admin.tenantId }, include: { homeowner: { include: { user: true } }, configuration: { include: { template: true, fields: { where: { active: true } } } }, definition: { include: { assignedTemplateVersion: { include: { templateSet: true } } } } } });
  if (!request) return fail("Document request not found.");
  const validityDate = submittedValidityDate || request.validityDate || (operation === "approve" && request.type === DocumentType.CERTIFICATE_OF_RESIDENCY ? oneYearFromToday() : undefined);
  const purpose = clean(formData.get("purpose")) || request.purpose;
  const scheduledDate = optionalDate(formData.get("scheduledDate")) || request.scheduledDate || undefined;
  const partyName = clean(formData.get("partyName")) || request.partyName;
  const vehicleDetails = clean(formData.get("vehicleDetails")) || request.vehicleDetails;
  const contractorDetails = clean(formData.get("contractorDetails")) || request.contractorDetails;
  const representativeName = clean(formData.get("representativeName")) || request.representativeName;
  const propertyDetails = clean(formData.get("propertyDetails")) || request.propertyDetails || request.homeowner.address;
  const startTime = clean(formData.get("startTime")) || request.startTime;
  const endTime = clean(formData.get("endTime")) || request.endTime;
  const passType = clean(formData.get("passType")) || request.passType;
  const processedByOfficerId = clean(formData.get("processedByOfficerId"));
  const approvedByOfficerId = clean(formData.get("approvedByOfficerId"));
  const requestedDownloadOverride = formData.get("allowDownloadDespiteBalance") === "on";
  const downloadOverrideReason = clean(formData.get("downloadOverrideReason"));
  const reviewedDataSnapshot = asJson({ fields: { purpose, remarks: request.remarks, validityDate: validityDate?.toISOString().slice(0, 10) ?? null, scheduledDate: scheduledDate?.toISOString().slice(0, 10) ?? null, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType }, adminRemarks, processedByOfficerId, approvedByOfficerId, numberOfCopies: Number(formData.get("numberOfCopies")) || request.numberOfCopies });
  const editAudits = documentEditAudits(request, { purpose, validityDate, scheduledDate, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType, adminRemarks, processedByOfficerId, approvedByOfficerId, numberOfCopies: Number(formData.get("numberOfCopies")) || request.numberOfCopies }, admin.id);
  const reviewableStatuses: DocumentRequestStatus[] = [DocumentRequestStatus.SUBMITTED, DocumentRequestStatus.PENDING_APPROVAL, DocumentRequestStatus.UNDER_REVIEW];
  if (request.homeowner.tenantId !== admin.tenantId) fail("Document request homeowner does not belong to this tenant.");
  if (request.configuration && request.configuration.tenantId !== admin.tenantId) fail("Document configuration does not belong to this tenant.");
  if (request.configuration?.template && (request.configuration.template.tenantId !== admin.tenantId || (request.type && request.configuration.template.type !== request.type))) fail("Document template does not belong to this tenant or document type.");
  if (request.definition && request.definition.tenantId !== admin.tenantId) fail("Document definition does not belong to this tenant.");
  if (request.definition?.assignedTemplateVersion && (request.definition.assignedTemplateVersion.tenantId !== admin.tenantId || request.definition.assignedTemplateVersion.templateSet.definitionId !== request.definition.id)) fail("Document template version does not belong to this definition.");
  if ((operation === "approve" || operation === "regenerate") && (request.type === DocumentType.GATE_PASS || request.type === DocumentType.MOVE_IN_OUT_PASS) && (!validityDate || !scheduledDate || !partyName)) fail("Pass validity date, scheduled date, and visitor or contractor name are required.");
  if (operation !== "reject" && ((validityDate && validityDate < todayUtc()) || (scheduledDate && scheduledDate < todayUtc()))) fail("Validity and scheduled dates must be today or later.");
  if (operation === "review") {
    if (!reviewableStatuses.includes(request.status)) fail("Only submitted or pending approval requests can be reviewed.");
    await platformPrisma.$transaction(async (tx) => {
      await tx.documentRequest.update({ where: { id: request.id }, data: { status: DocumentRequestStatus.UNDER_REVIEW, reviewedAt: new Date(), processedById: admin.id, adminRemarks, purpose, validityDate, scheduledDate, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType, processedByOfficerId, approvedByOfficerId, reviewedDataSnapshot } });
      await createDocumentEditAudits(tx, request.tenantId, request.id, editAudits);
      await createDocumentHistories(tx, request.tenantId, request.id, [{ status: DocumentRequestStatus.UNDER_REVIEW, actorId: admin.id, note: adminRemarks || "Review started." }]);
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "REVIEW", entityType: "DocumentRequest", entityId: request.id, metadata: { adminRemarks, role: admin.role } } });
    });
  } else if (operation === "reject") {
    if (!adminRemarks) fail("A rejection reason is required.");
    if (request.status === DocumentRequestStatus.GENERATED || request.status === DocumentRequestStatus.READY_FOR_DOWNLOAD || request.status === DocumentRequestStatus.DOWNLOADED) fail("Generated documents cannot be rejected.");
    await platformPrisma.$transaction(async (tx) => {
      await tx.documentRequest.update({ where: { id: request.id }, data: { status: DocumentRequestStatus.REJECTED, reviewedAt: new Date(), processedById: admin.id, adminRemarks, reviewedDataSnapshot } });
      await createDocumentEditAudits(tx, request.tenantId, request.id, editAudits);
      await createDocumentHistories(tx, request.tenantId, request.id, [{ status: DocumentRequestStatus.REJECTED, actorId: admin.id, note: adminRemarks }]);
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "REJECT", entityType: "DocumentRequest", entityId: request.id, metadata: { adminRemarks, role: admin.role } } });
    });
  } else if (operation === "approve" || operation === "regenerate") {
    const regenerating = operation === "regenerate";
    if (request.paymentRequiredSnapshot && !regenerating) fail("Payment confirmation is required before this paid document can be approved for download. Finance integration is deferred to Sprint 6B.");
    if (!regenerating && !reviewableStatuses.includes(request.status)) fail("Only pending requests can be approved.");
    if (regenerating && (!request.generatedContent || !request.documentNumber || !request.verificationCode || request.archivedAt)) fail("Only active generated documents can be regenerated.");
    const [unpaid, template, payments, constructionBonds, association, officers] = await Promise.all([
      getQualifyingHomeownerBalance(admin.tenantId, request.homeownerId),
      request.configuration?.template?.active ? Promise.resolve(request.configuration.template) : request.type ? prisma.documentTemplate.findFirst({ where: { tenantId: admin.tenantId, type: request.type } }) : Promise.resolve(null),
      prisma.payment.aggregate({ where: { tenantId: admin.tenantId, homeownerId: request.homeownerId, status: "ACTIVE" }, _sum: { amount: true } }),
      prisma.collection.findMany({ where: { tenantId: admin.tenantId, homeownerId: request.homeownerId, type: "CONSTRUCTION_BOND", refundable: true } }),
      getAssociationSettings(admin.tenantId),
      getActiveOrganizationOfficers(admin.tenantId),
    ]);
    const definitionTemplate = request.definition?.assignedTemplateVersion?.status === DocumentTemplateVersionStatus.PUBLISHED ? request.definition.assignedTemplateVersion : null;
    const templateBody = template?.active ? template.body : structuredTemplateText(request.templateDefinitionSnapshot ?? definitionTemplate?.definitionJson);
    if (!templateBody) return fail("The document template is inactive or missing.");
    if (template && (template.tenantId !== admin.tenantId || (request.type && template.type !== request.type))) fail("The document template does not belong to this tenant or document type.");
    const outstandingBalance = unpaid;
    const balancePolicy = policyForDocumentRequest(request);
    const allowDownloadDespiteBalance = balancePolicy === DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE && requestedDownloadOverride;
    if (requestedDownloadOverride && balancePolicy !== DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE) fail("This document definition does not allow admin balance overrides.");
    if (allowDownloadDespiteBalance && !canOverrideDocumentBalancePolicy(admin.role)) fail("Your role is not authorized to allow download despite an outstanding balance.");
    if (allowDownloadDespiteBalance && outstandingBalance > 0 && !downloadOverrideReason) fail("Enter a reason when allowing download despite an outstanding balance.");
    const processedOfficer = officers.find((officer) => officer.id === processedByOfficerId) || null;
    const approvedOfficer = officers.find((officer) => officer.id === approvedByOfficerId) || null;
    if (processedByOfficerId && !processedOfficer) fail("Select an active processing officer.");
    if (approvedByOfficerId && !approvedOfficer) fail("Select an active approving officer.");
    const now = new Date();
    const verificationCode = randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
    await platformPrisma.$transaction(async (tx) => {
      const documentNumber = regenerating ? request.documentNumber! : request.definition
        ? await allocateDefinitionDocumentNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, request.definition, now)
        : request.type
          ? await allocateDocumentNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, request.type, now)
          : fail("Document definition is required before generating a custom document.");
      const nextVersion = regenerating ? Math.max(1, request.currentVersion) + 1 : 1;
      const content = renderDocumentTemplate(templateBody, {
        associationName: association.name,
        homeownerName: request.homeowner.user.name,
        propertyAddress: request.homeowner.address,
        block: request.homeowner.block,
        lot: request.homeowner.lot,
        purpose: purpose || "official purposes",
        issueDate: shortDate(now),
        validityDate: validityDate ? shortDate(validityDate) : "Not specified",
        scheduledDate: scheduledDate ? shortDate(scheduledDate) : "Not specified",
        startTime: startTime || "",
        endTime: endTime || "",
        passType: passType?.replaceAll("_", " ") || "",
        vehicleDetails: vehicleDetails || "None specified",
        partyName: partyName || "",
        contractorDetails: contractorDetails || "None specified",
        totalPayments: money(Number(payments._sum.amount ?? 0)),
        constructionBondBalance: money(constructionBonds.reduce((sum, item) => sum + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0)),
        documentNumber,
        association_name: association.name,
        association_address: association.address,
        association_contact: association.contactNumber,
        association_email: association.email,
        sec_registration_number: association.secRegistrationNumber,
        homeowner_name: request.homeowner.user.name,
        property_address: request.homeowner.address,
        block_lot: `Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`,
        document_number: documentNumber,
        request_date: shortDate(request.requestedAt),
        approval_date: shortDate(now),
        validity_date: validityDate ? shortDate(validityDate) : "Not specified",
        processed_by: processedOfficer?.fullName || admin.name,
        approved_by: approvedOfficer?.fullName || admin.name,
        qr_verification_code: verificationCode,
        remarks: adminRemarks || request.remarks || "",
        issue_day_ordinal: ordinal(now.getUTCDate()),
        issue_month_year: now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
        office_location: association.address,
        age: request.homeowner.birthDate ? String(ageAt(request.homeowner.birthDate, now)) : "Not specified",
        civil_status: request.homeowner.civilStatus || "Not specified",
        citizenship: request.homeowner.citizenship || "Not specified",
        occupation: request.homeowner.occupation || "Not specified",
        residency_date: request.homeowner.residencyDate ? shortDate(request.homeowner.residencyDate) : "Not specified",
        phase: request.homeowner.phase || association.name,
        property_type: request.homeowner.propertyType || "Not specified",
        occupancy_status: request.homeowner.occupancyStatus || "Not specified",
        contact_number: request.homeowner.phone,
      });
      const requestSnapshot = asJson({ type: request.type, purpose, validityDate, scheduledDate, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType, adminRemarks, processedByOfficerId: processedOfficer?.id, approvedByOfficerId: approvedOfficer?.id, allowDownloadDespiteBalance });
      await tx.documentRequest.update({ where: { id: request.id }, data: { status: DocumentRequestStatus.READY_FOR_DOWNLOAD, documentNumber, purpose, validityDate, scheduledDate, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType, outstandingBalanceAtRequest: outstandingBalance, allowDownloadDespiteBalance, downloadOverrideReason: allowDownloadDespiteBalance ? downloadOverrideReason : null, downloadOverrideAt: allowDownloadDespiteBalance ? now : null, downloadOverrideById: allowDownloadDespiteBalance ? admin.id : null, reviewedAt: request.reviewedAt ?? now, approvedAt: now, generatedAt: now, readyForDownloadAt: now, downloadedAt: null, processedById: admin.id, approvedById: admin.id, processedByOfficerId: processedOfficer?.id, approvedByOfficerId: approvedOfficer?.id, adminRemarks, reviewedDataSnapshot, templateVersion: template?.version ?? definitionTemplate?.version ?? request.templateVersionSnapshot ?? 1, templateVersionSnapshot: template?.version ?? definitionTemplate?.version ?? request.templateVersionSnapshot, templateVersionIdSnapshot: definitionTemplate?.id ?? request.templateVersionIdSnapshot, templateIdSnapshot: template?.id ?? request.templateIdSnapshot, templateSnapshot: templateBody, templateDefinitionSnapshot: request.templateDefinitionSnapshot ?? definitionTemplate?.definitionJson ?? undefined, generatedContent: content, verificationCode, currentVersion: nextVersion, associationSnapshot: asJson(association), homeownerSnapshot: request.subjectSnapshot ?? asJson({ name: request.homeowner.user.name, email: request.homeowner.user.email, address: request.homeowner.address, block: request.homeowner.block, lot: request.homeowner.lot, phone: request.homeowner.phone, birthDate: request.homeowner.birthDate, civilStatus: request.homeowner.civilStatus, citizenship: request.homeowner.citizenship, occupation: request.homeowner.occupation, residencyDate: request.homeowner.residencyDate, phase: request.homeowner.phase, propertyType: request.homeowner.propertyType, occupancyStatus: request.homeowner.occupancyStatus }), organizationSnapshot: asJson(officers.map(officerSnapshot)), processedOfficerSnapshot: processedOfficer ? asJson(officerSnapshot(processedOfficer)) : undefined, approvedOfficerSnapshot: approvedOfficer ? asJson(officerSnapshot(approvedOfficer)) : undefined } });
      await createDocumentEditAudits(tx, request.tenantId, request.id, editAudits);
      await createDocumentHistories(tx, request.tenantId, request.id, regenerating ? [{ status: DocumentRequestStatus.READY_FOR_DOWNLOAD, actorId: admin.id, note: `Regenerated ${documentNumber} as version ${nextVersion}. Previous versions remain archived.` }] : [{ status: DocumentRequestStatus.APPROVED, actorId: admin.id, note: adminRemarks || "Approved by administrator." }, { status: DocumentRequestStatus.READY_FOR_DOWNLOAD, actorId: admin.id, note: `Generated as ${documentNumber}, version 1.${outstandingBalance > 0 && balancePolicy !== DocumentOutstandingBalancePolicy.IGNORE_BALANCE && !allowDownloadDespiteBalance ? " Download restricted by the configured outstanding balance policy." : ""}` }]);
      await tx.documentVersion.create({ data: { tenantId: request.tenantId, requestId: request.id, definitionId: request.definitionId, templateVersionId: definitionTemplate?.id ?? null, version: nextVersion, documentNumber, verificationCode, templateVersion: template?.version ?? definitionTemplate?.version ?? request.templateVersionSnapshot ?? 1, templateSnapshot: templateBody, generatedContent: content, requestSnapshot, definitionSnapshot: request.definitionSnapshot ?? undefined, templateDefinitionSnapshot: request.templateDefinitionSnapshot ?? definitionTemplate?.definitionJson ?? undefined, generatedById: admin.id, reason: regenerating ? adminRemarks || "Approved document edited and regenerated." : request.origin === "ADMIN" ? "Admin-initiated document generation." : "Homeowner request approved and generated." } });
      await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: admin.id, module: "DOCUMENTS", action: regenerating ? "EDIT_AND_REGENERATE" : request.origin === "ADMIN" ? "ADMIN_GENERATE_DOCUMENT" : "APPROVE_AND_GENERATE", entityType: "DocumentRequest", entityId: request.id, metadata: { documentNumber, version: nextVersion, templateVersion: template?.version ?? definitionTemplate?.version ?? request.templateVersionSnapshot ?? 1, verificationCode, outstandingBalance, allowDownloadDespiteBalance, downloadOverrideReason, oldValue: regenerating ? { version: request.currentVersion, purpose: request.purpose, validityDate: request.validityDate, propertyDetails: request.propertyDetails, vehicleDetails: request.vehicleDetails, partyName: request.partyName, contractorDetails: request.contractorDetails } : null, newValue: requestSnapshot, role: admin.role, remarks: adminRemarks } } });
      if (allowDownloadDespiteBalance && outstandingBalance > 0) await tx.auditLog.create({ data: { tenantId: request.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "DOWNLOAD_BALANCE_OVERRIDE", entityType: "DocumentRequest", entityId: request.id, metadata: { documentNumber, outstandingBalance, reason: downloadOverrideReason } } });
    });
  } else {
    fail("Select a valid request action.");
  }
  if (operation === "approve" || operation === "reject") {
    const approved = operation === "approve";
    const appUrl = getAppUrl();
    await sendEmailNotification({
      tenantId: request.tenantId,
      recipientId: request.homeowner.user.id,
      email: request.homeowner.user.email,
      subject: approved ? "Your HOA document request was approved" : "Update on your HOA document request",
      heading: approved ? "Document approved" : "Document request rejected",
      message: approved ? `Hello ${request.homeowner.user.name},\nYour ${documentRequestLabel(request).toLowerCase()} request has been approved and generated. You can review it in the homeowner portal.` : `Hello ${request.homeowner.user.name},\nYour ${documentRequestLabel(request).toLowerCase()} request was not approved.\nReason: ${adminRemarks || "Please contact the HOA office for details."}`,
      type: approved ? NotificationType.DOCUMENT_APPROVED : NotificationType.DOCUMENT_REJECTED,
      actionLabel: "View document requests",
      actionUrl: `${appUrl}/portal/documents`,
    }).catch(() => undefined);
  }
  revalidateDocumentPages(id);
  redirect(`${returnPath}?success=${operation}&message=${encodeURIComponent(operation === "approve" ? "Document approved and generated successfully." : operation === "regenerate" ? "Document updated and regenerated. The previous version was preserved." : operation === "review" ? "Review details saved successfully." : "Request rejected successfully.")}`);
}

export async function generateManualDocumentAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const homeownerId = String(formData.get("homeownerId") || "");
  const type = String(formData.get("type") || "") as DocumentType;
  const purpose = clean(formData.get("purpose"));
  if (!homeownerId || !documentTypeOptions.some((item) => item.value === type) || !purpose) redirect("/admin/documents/new?error=Select%20a%20homeowner%2C%20document%20type%2C%20and%20enter%20a%20purpose.");
  const [homeowner, config] = await Promise.all([
    prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId: admin.tenantId }, include: { user: true } }),
    prisma.documentTypeConfiguration.findFirst({ where: { tenantId: admin.tenantId, type, active: true }, include: { template: true, fields: true } }),
  ]);
  if (!homeowner) redirect("/admin/documents/new?error=Homeowner%20not%20found.");
  if (config && needsTemplate(config) && !config.template?.active) redirect("/admin/documents/new?error=This%20document%20type%20does%20not%20have%20an%20active%20template.");
  const unpaid = await prisma.bill.aggregate({ where: { tenantId: admin.tenantId, homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } });
  const requestValues = { purpose, remarks: clean(formData.get("remarks")) || "", validityDate: String(formData.get("validityDate") || ""), scheduledDate: String(formData.get("scheduledDate") || ""), startTime: clean(formData.get("startTime")) || "", endTime: clean(formData.get("endTime")) || "", passType: clean(formData.get("passType")) || "", vehicleDetails: clean(formData.get("vehicleDetails")) || "", partyName: clean(formData.get("partyName")) || "", contractorDetails: clean(formData.get("contractorDetails")) || "", representativeName: clean(formData.get("representativeName")) || "", propertyDetails: clean(formData.get("propertyDetails")) || homeowner.address };
  const subjectSnapshot = buildSubjectSnapshot({ subjectType: DocumentSubjectType.SELF, homeowner });
  const request = await prisma.documentRequest.create({ data: { tenantId: admin.tenantId, homeownerId, type, configurationId: config?.id, configurationVersion: config?.version, templateIdSnapshot: config?.template?.id, templateVersionSnapshot: config?.template?.version, subjectType: DocumentSubjectType.SELF, subjectSnapshot: subjectSnapshotJson(subjectSnapshot), requestDataSnapshot: asJson({ type, fields: requestValues, numberOfCopies: 1 }), deliveryModeSnapshot: config?.deliveryMode ?? DocumentDeliveryMode.APPROVAL_REQUIRED, approvalRequiredSnapshot: true, paymentRequiredSnapshot: config?.paymentRequired ?? false, feeAmountSnapshot: config?.feeAmount ?? 0, numberOfCopies: 1, origin: "ADMIN", initiatedById: admin.id, status: DocumentRequestStatus.SUBMITTED, purpose, remarks: requestValues.remarks, validityDate: optionalDate(formData.get("validityDate")), scheduledDate: optionalDate(formData.get("scheduledDate")), startTime: requestValues.startTime, endTime: requestValues.endTime, passType: requestValues.passType, vehicleDetails: requestValues.vehicleDetails, partyName: requestValues.partyName, contractorDetails: requestValues.contractorDetails, representativeName: requestValues.representativeName, propertyDetails: requestValues.propertyDetails, outstandingBalanceAtRequest: Number(unpaid._sum.balance ?? 0), histories: { create: { tenantId: admin.tenantId, status: DocumentRequestStatus.SUBMITTED, actorId: admin.id, note: "Created by administrator for a walk-in or office transaction." } } } });
  await prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "ADMIN_INITIATE_DOCUMENT", entityType: "DocumentRequest", entityId: request.id, metadata: { homeownerId, type, role: admin.role, purpose } } });
  formData.set("id", request.id); formData.set("operation", "approve"); formData.set("returnTo", `/admin/documents/${request.id}`);
  return processDocumentRequestAction(formData);
}

export async function updateDocumentBalanceOverrideAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const operation = String(formData.get("operation") || "").trim().toUpperCase();
  const requestedReturnPath = String(formData.get("returnTo") || "");
  const returnPath = /^\/admin\/documents\/[A-Za-z0-9_-]+$/.test(requestedReturnPath) ? requestedReturnPath : "/admin/documents";
  const fail = (message: string): never => redirect(`${returnPath}?error=${encodeURIComponent(message)}`);
  if (!id) fail("Document request not found.");
  if (!canOverrideDocumentBalancePolicy(admin.role)) fail("Your role is not authorized to manage balance overrides.");
  const request = await prisma.documentRequest.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { homeowner: { include: { user: true } }, definition: true },
  });
  if (!request) fail("Document request not found.");
  const requestRecord = request!;
  if (requestRecord.homeowner.tenantId !== admin.tenantId) fail("Document request homeowner does not belong to this tenant.");
  if (policyForDocumentRequest(requestRecord) !== DocumentOutstandingBalancePolicy.ALLOW_ADMIN_OVERRIDE) fail("This document definition does not allow admin balance overrides.");
  const currentBalance = await getQualifyingHomeownerBalance(admin.tenantId, requestRecord.homeownerId);
  const reason = clean(formData.get("reason"));
  const now = new Date();
  if (operation === "ALLOW") {
    if (currentBalance <= 0) fail("No qualifying outstanding balance exists for this homeowner.");
    if (!reason) fail("Enter a reason for allowing release despite the outstanding balance.");
    await platformPrisma.$transaction([
      platformPrisma.documentRequest.update({
        where: { id: requestRecord.id },
        data: { allowDownloadDespiteBalance: true, downloadOverrideReason: reason, downloadOverrideAt: now, downloadOverrideById: admin.id },
      }),
      platformPrisma.documentRequestHistory.create({
        data: { tenantId: requestRecord.tenantId, requestId: requestRecord.id, status: requestRecord.status, actorId: admin.id, note: `Balance release override granted. Reason: ${reason}` },
      }),
      platformPrisma.auditLog.create({
        data: { tenantId: requestRecord.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "DOWNLOAD_BALANCE_OVERRIDE", entityType: "DocumentRequest", entityId: requestRecord.id, metadata: { documentNumber: requestRecord.documentNumber, currentBalance, reason, homeownerId: requestRecord.homeownerId } },
      }),
    ]);
    revalidateDocumentPages(requestRecord.id);
    redirect(`${returnPath}?success=balance-override&message=Balance%20release%20override%20recorded.`);
  }
  if (operation === "REVOKE") {
    if (!requestRecord.allowDownloadDespiteBalance) fail("No active balance override is recorded for this request.");
    await platformPrisma.$transaction([
      platformPrisma.documentRequest.update({ where: { id: requestRecord.id }, data: { allowDownloadDespiteBalance: false } }),
      platformPrisma.documentRequestHistory.create({
        data: { tenantId: requestRecord.tenantId, requestId: requestRecord.id, status: requestRecord.status, actorId: admin.id, note: reason ? `Balance release override revoked. Reason: ${reason}` : "Balance release override revoked." },
      }),
      platformPrisma.auditLog.create({
        data: { tenantId: requestRecord.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "REVOKE_DOWNLOAD_BALANCE_OVERRIDE", entityType: "DocumentRequest", entityId: requestRecord.id, metadata: { documentNumber: requestRecord.documentNumber, currentBalance, reason: reason || null, homeownerId: requestRecord.homeownerId } },
      }),
    ]);
    revalidateDocumentPages(requestRecord.id);
    redirect(`${returnPath}?success=balance-override-revoked&message=Balance%20release%20override%20revoked.`);
  }
  fail("Select a valid balance override action.");
}

export async function archiveDocumentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN); const id = String(formData.get("id") || ""); const reason = clean(formData.get("reason"));
  const existing = await prisma.documentRequest.findFirst({ where: { id, tenantId: admin.tenantId } }); if (!existing || existing.archivedAt) redirect("/admin/documents?error=Document%20request%20not%20found%20or%20already%20archived.");
  await prisma.$transaction([prisma.documentRequest.update({ where: { id }, data: { archivedAt: new Date(), archivedById: admin.id, archiveReason: reason || "Archived by administrator." } }), prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "ARCHIVE_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: id, metadata: { role: admin.role, oldValue: { archivedAt: null }, newValue: { archived: true }, remarks: reason } } })]);
  revalidateDocumentPages(id); redirect("/admin/documents?success=archived&message=Document%20request%20archived%20successfully.");
}

export async function restoreDocumentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN); const id = String(formData.get("id") || ""); const existing = await prisma.documentRequest.findFirst({ where: { id, tenantId: admin.tenantId } }); if (!existing?.archivedAt) redirect("/admin/documents/archive?error=Archived%20document%20not%20found.");
  await prisma.$transaction([prisma.documentRequest.update({ where: { id }, data: { archivedAt: null, archivedById: null, archiveReason: null } }), prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "RESTORE_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: id, metadata: { role: admin.role, oldValue: { archivedAt: existing.archivedAt }, newValue: { archived: false } } } })]);
  revalidateDocumentPages(id); revalidatePath("/admin/documents/archive"); redirect(`/admin/documents/${id}?success=restored&message=Document%20request%20restored%20successfully.`);
}

export async function saveDocumentTemplateAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const type = String(formData.get("type") || "") as DocumentType;
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const active = formData.get("active") === "on";
  if (!documentTypeOptions.some((item) => item.value === type) || title.length < 3 || body.length < 20) redirect("/admin/document-templates?error=Enter%20a%20valid%20title%20and%20template%20body.");
  const existing = await prisma.documentTemplate.findFirst({ where: { type } });
  const template = await prisma.documentTemplate.upsert({ where: { tenantId_type: { tenantId: admin.tenantId, type } }, create: { tenantId: admin.tenantId, type, title, body, active, updatedById: admin.id }, update: { title, body, active, updatedById: admin.id, version: { increment: 1 } } });
  await prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: existing ? "UPDATE_TEMPLATE" : "CREATE_TEMPLATE", entityType: "DocumentTemplate", entityId: template.id, metadata: { type, version: template.version, active } } });
  revalidatePath("/admin/document-templates");
  revalidatePath("/portal/documents");
  redirect(`/admin/document-templates?success=saved&message=${encodeURIComponent(`${title} template saved as version ${template.version}. Existing generated documents were not changed.`)}`);
}

export async function saveDocumentTypeConfigurationAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const id = String(formData.get("id") || "");
  const fail = (message: string): never => redirect(`/admin/settings/document-types?error=${encodeURIComponent(message)}`);
  const config = await prisma.documentTypeConfiguration.findFirst({ where: { id, tenantId: admin.tenantId }, include: { fields: true } });
  if (!config) fail("Document type configuration not found.");
  const configRecord = config!;
  const displayName = String(formData.get("displayName") || "").trim();
  const description = clean(formData.get("description"));
  const deliveryMode = String(formData.get("deliveryMode") || configRecord.deliveryMode) as DocumentDeliveryMode;
  if (!Object.values(DocumentDeliveryMode).includes(deliveryMode)) fail("Select a valid delivery mode.");
  let feeAmount = "0.00";
  try {
    feeAmount = decimalFromForm(formData.get("feeAmount"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Enter a valid fee amount.");
  }
  const maxCopies = Math.max(1, Math.min(25, Number(formData.get("maxCopies")) || 1));
  const validityDays = formData.get("validityDays") ? Math.max(1, Number(formData.get("validityDays")) || 0) : null;
  const templateId = clean(formData.get("templateId"));
  const signatoryOfficerId = clean(formData.get("signatoryOfficerId"));
  if (templateId) {
    const template = await prisma.documentTemplate.findFirst({ where: { id: templateId, tenantId: admin.tenantId, type: configRecord.type } });
    if (!template) fail("Select a tenant-owned template for the same document type.");
  }
  if (signatoryOfficerId) {
    const officer = await prisma.organizationOfficer.findFirst({ where: { id: signatoryOfficerId, tenantId: admin.tenantId, active: true, archivedAt: null } });
    if (!officer) fail("Select an active tenant officer as signatory.");
  }
  let fields: ReturnType<typeof parseFieldsJson> = [];
  try {
    fields = parseFieldsJson(String(formData.get("fieldsJson") || "[]"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Field definitions are invalid.");
  }
  if (!displayName || fields.length === 0) fail("Enter a display name and at least one field definition.");
  const definitionFields = configRecord.definitionId ? await prisma.documentDefinitionField.findMany({ where: { tenantId: admin.tenantId, definitionId: configRecord.definitionId }, select: { id: true, key: true } }) : [];
  const definitionFieldByKey = new Map(definitionFields.map((field) => [field.key, field.id]));
  await platformPrisma.$transaction([
    platformPrisma.documentTypeConfiguration.update({
      where: { id },
      data: {
        displayName,
        description,
        active: formData.get("active") === "on",
        templateId,
        deliveryMode,
        approvalRequired: formData.get("approvalRequired") === "on",
        paymentRequired: formData.get("paymentRequired") === "on",
        paymentBeforeApproval: formData.get("paymentBeforeApproval") === "on",
        allowImmediateDownload: formData.get("allowImmediateDownload") === "on",
        allowRegeneration: formData.get("allowRegeneration") === "on",
        requiresAdminReview: formData.get("requiresAdminReview") === "on",
        homeownerDownloadEnabled: formData.get("homeownerDownloadEnabled") === "on",
        validityDays,
        maxCopies,
        feeAmount,
        allowPayLater: formData.get("allowPayLater") === "on",
        signatoryOfficerId,
        updatedById: admin.id,
        version: { increment: 1 },
      },
    }),
    platformPrisma.documentFieldConfiguration.deleteMany({ where: { tenantId: admin.tenantId, configId: id } }),
    platformPrisma.documentFieldConfiguration.createMany({
      data: fields.map((field, index) => ({ ...field, tenantId: admin.tenantId, configId: id, definitionFieldId: definitionFieldByKey.get(field.key), displayOrder: index * 10 + 10 })),
    }),
    platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "UPDATE_DOCUMENT_TYPE_CONFIGURATION", entityType: "DocumentTypeConfiguration", entityId: id, metadata: { type: configRecord.type, deliveryMode, feeAmount, maxCopies, active: formData.get("active") === "on" } } }),
  ]);
  revalidatePath("/admin/settings/document-types");
  revalidatePath("/portal/documents");
  redirect(`/admin/settings/document-types?success=saved&message=${encodeURIComponent(`${displayName} configuration saved.`)}`);
}

export async function saveDocumentDefinitionAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const id = clean(formData.get("id"));
  const fail = (message: string): never => redirect(`/admin/settings/document-definitions?${id ? `edit=${id}&` : ""}error=${encodeURIComponent(message)}`);
  const code = String(formData.get("code") || "").trim().toUpperCase().replace(/\s+/g, "_");
  const displayName = String(formData.get("displayName") || "").trim();
  if (!/^[A-Z][A-Z0-9_-]{1,60}$/.test(code)) fail("Code must start with a letter and use only letters, numbers, underscores, or hyphens.");
  if (displayName.length < 3) fail("Display name must be at least 3 characters.");
  const existingByCode = await prisma.documentDefinition.findFirst({ where: { tenantId: admin.tenantId, code, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (existingByCode) fail("A document definition with this code already exists for this tenant.");
  const existingDefinition = id ? await prisma.documentDefinition.findFirst({ where: { id, tenantId: admin.tenantId }, select: { id: true, tenantId: true, legacyType: true, archivedAt: true, status: true, version: true } }) : null;
  if (id && !existingDefinition) fail("Document definition not found.");
  const workflowPreset = String(formData.get("workflowPreset") || "FREE_APPROVAL");
  const workflowFields = workflowFieldsForPreset(workflowPreset);
  if (!workflowFields) fail("Select a valid workflow.");
  const workflow = workflowFields!;
  let feeAmount = "0.00";
  try {
    feeAmount = decimalFromForm(formData.get("feeAmount"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Enter a valid fee amount.");
  }
  if (!workflow.paymentRequired && Number(feeAmount) !== 0) fail("Free workflows must have a zero fee.");
  if (workflow.paymentRequired && Number(feeAmount) <= 0) fail("Paid workflows require a fee greater than zero.");
  if (!workflow.paymentRequired) feeAmount = "0.00";
  const numberingFormat = String(formData.get("numberingFormat") || defaultNumberingFormat(code)).trim();
  const numbering = validateNumberingFormat(numberingFormat);
  if (!numbering.valid) fail(numbering.errors[0]);
  const sequenceScope = String(formData.get("sequenceScope") || DocumentSequenceScope.ANNUAL) as DocumentSequenceScope;
  if (!Object.values(DocumentSequenceScope).includes(sequenceScope)) fail("Select a valid sequence scope.");
  const balancePolicy = normalizeOutstandingBalancePolicy(formData.get("outstandingBalancePolicy")) ?? fail("Select a valid outstanding balance policy.");
  const legacyTypeValue = nullableText(formData.get("legacyType")) as DocumentType | null;
  if (legacyTypeValue && !Object.values(DocumentType).includes(legacyTypeValue)) fail("Select a valid legacy compatibility type.");
  const signatoryOfficerId = nullableText(formData.get("signatoryOfficerId"));
  if (signatoryOfficerId) {
    const officer = await prisma.organizationOfficer.findFirst({ where: { tenantId: admin.tenantId, id: signatoryOfficerId, active: true, archivedAt: null }, select: { id: true } });
    if (!officer) fail("Select an active tenant officer as signatory.");
  }
  const maxCopies = Math.max(1, Math.min(25, Number(formData.get("maxCopies")) || 1));
  const validityDays = formData.get("validityDays") ? Math.max(1, Number(formData.get("validityDays")) || 0) : null;
  const active = booleanFromForm(formData, "active");
  const archived = Boolean(existingDefinition?.archivedAt || existingDefinition?.status === DocumentDefinitionStatus.ARCHIVED);
  const data = {
    code,
    displayName,
    description: nullableText(formData.get("description")),
    category: nullableText(formData.get("category")),
    displayOrder: Number(formData.get("displayOrder")) || 0,
    active: archived ? false : active,
    status: archived ? DocumentDefinitionStatus.ARCHIVED : active ? DocumentDefinitionStatus.ACTIVE : DocumentDefinitionStatus.INACTIVE,
    legacyType: legacyTypeValue,
    ...workflow,
    feeAmount,
    currency: clean(formData.get("currency")) || "PHP",
    outstandingBalancePolicy: balancePolicy,
    receiptRequired: workflow.paymentRequired && booleanFromForm(formData, "receiptRequired"),
    financeClassification: nullableText(formData.get("financeClassification")),
    allowPayLater: workflow.paymentRequired && booleanFromForm(formData, "allowPayLater"),
    releaseRequired: booleanFromForm(formData, "releaseRequired"),
    homeownerDownloadEnabled: booleanFromForm(formData, "homeownerDownloadEnabled"),
    walkInEnabled: booleanFromForm(formData, "walkInEnabled"),
    householdMemberEnabled: booleanFromForm(formData, "householdMemberEnabled"),
    manualSubjectEnabled: booleanFromForm(formData, "manualSubjectEnabled"),
    allowRegeneration: booleanFromForm(formData, "allowRegeneration"),
    numberingFormat,
    sequenceScope,
    validityDays,
    maxCopies,
    qrEnabled: booleanFromForm(formData, "qrEnabled"),
    watermarkEnabled: booleanFromForm(formData, "watermarkEnabled"),
    signatoryOfficerId,
    updatedById: admin.id,
  };
  if (id) {
    await platformPrisma.$transaction(async (tx) => {
      await tx.documentDefinition.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      if (existingDefinition?.legacyType && existingDefinition.legacyType !== legacyTypeValue) {
        await tx.documentTypeConfiguration.updateMany({ where: { tenantId: admin.tenantId, type: existingDefinition.legacyType, definitionId: id }, data: { definitionId: null, updatedById: admin.id, version: { increment: 1 } } });
      }
      if (legacyTypeValue) await syncLegacyDefinitionConfiguration(tx, admin.tenantId, legacyTypeValue, id, data, admin.id);
      await tx.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "UPDATE_DOCUMENT_DEFINITION", entityType: "DocumentDefinition", entityId: id, metadata: { code, workflow: workflowPreset, feeAmount, outstandingBalancePolicy: balancePolicy } } });
    });
  } else {
    const definition = await platformPrisma.$transaction(async (tx) => {
      const created = await tx.documentDefinition.create({ data: { ...data, tenantId: admin.tenantId, systemKey: legacyTypeValue ? `CUSTOMIZED_${legacyTypeValue}` : null, createdById: admin.id } });
      if (legacyTypeValue) await syncLegacyDefinitionConfiguration(tx, admin.tenantId, legacyTypeValue, created.id, data, admin.id);
      await tx.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "CREATE_DOCUMENT_DEFINITION", entityType: "DocumentDefinition", entityId: created.id, metadata: { code, workflow: workflowPreset, feeAmount, outstandingBalancePolicy: balancePolicy } } });
      return created;
    });
    revalidatePath("/admin/settings/document-definitions");
    revalidatePath("/portal/documents");
    redirect(`/admin/settings/document-definitions?edit=${definition.id}&success=saved&message=${encodeURIComponent(`${displayName} definition saved.`)}`);
  }
  revalidatePath("/admin/settings/document-definitions");
  revalidatePath("/portal/documents");
  redirect(`/admin/settings/document-definitions?edit=${id}&success=saved&message=${encodeURIComponent(`${displayName} definition saved.`)}`);
}

export async function changeDocumentDefinitionStatusAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const id = String(formData.get("id") || "");
  const operation = String(formData.get("operation") || "").trim().toUpperCase();
  const fail = (message: string): never => redirect(`/admin/settings/document-definitions?error=${encodeURIComponent(message)}`);
  const definition = await prisma.documentDefinition.findFirst({ where: { id, tenantId: admin.tenantId }, include: { requests: { select: { id: true }, take: 1 }, documentVersions: { select: { id: true }, take: 1 } } });
  if (!definition) fail("Document definition not found.");
  const definitionRecord = definition!;
  const operations = {
    ACTIVATE: { data: { active: true, status: DocumentDefinitionStatus.ACTIVE }, pastTense: "activated" },
    DEACTIVATE: { data: { active: false, status: DocumentDefinitionStatus.INACTIVE }, pastTense: "deactivated" },
    ARCHIVE: { data: { active: false, status: DocumentDefinitionStatus.ARCHIVED, archivedAt: new Date() }, pastTense: "archived" },
  } satisfies Record<string, { data: Prisma.DocumentDefinitionUpdateInput; pastTense: string }>;
  const data = operations[operation as keyof typeof operations]?.data;
  if (!data) fail("Select a valid definition action.");
  if ((definitionRecord.archivedAt || definitionRecord.status === DocumentDefinitionStatus.ARCHIVED) && operation !== "ARCHIVE") fail("Archived definitions cannot be activated or deactivated without a restore workflow.");
  await platformPrisma.$transaction([
    platformPrisma.documentDefinition.update({ where: { id }, data: { ...data, updatedById: admin.id, version: { increment: 1 } } }),
    platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: `DOCUMENT_DEFINITION_${operation}`, entityType: "DocumentDefinition", entityId: id, metadata: { code: definitionRecord.code, hadRequests: definitionRecord.requests.length > 0, hadVersions: definitionRecord.documentVersions.length > 0 } } }),
  ]);
  revalidatePath("/admin/settings/document-definitions");
  revalidatePath("/portal/documents");
  redirect(`/admin/settings/document-definitions?success=${operation.toLowerCase()}&message=${encodeURIComponent(`${definitionRecord.displayName} ${operations[operation as keyof typeof operations].pastTense}.`)}`);
}

export async function duplicateDocumentDefinitionAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const id = String(formData.get("id") || "");
  const definition = await prisma.documentDefinition.findFirst({ where: { id, tenantId: admin.tenantId }, include: { fields: true } });
  if (!definition) redirect("/admin/settings/document-definitions?error=Document%20definition%20not%20found.");
  const definitionRecord = definition!;
  const code = uniqueCopyCode(definitionRecord.code);
  const copy = await platformPrisma.$transaction(async (tx) => {
    const created = await tx.documentDefinition.create({
      data: {
        tenantId: admin.tenantId,
        code,
        displayName: `${definitionRecord.displayName} Copy`,
        description: definitionRecord.description,
        category: definitionRecord.category,
        status: DocumentDefinitionStatus.DRAFT,
        active: false,
        displayOrder: definitionRecord.displayOrder + 1,
        legacyType: definitionRecord.legacyType,
        deliveryMode: definitionRecord.deliveryMode,
        approvalRequired: definitionRecord.approvalRequired,
        paymentRequired: definitionRecord.paymentRequired,
        paymentBeforeApproval: definitionRecord.paymentBeforeApproval,
        allowImmediateDownload: definitionRecord.allowImmediateDownload,
        requiresAdminReview: definitionRecord.requiresAdminReview,
        releaseRequired: definitionRecord.releaseRequired,
        homeownerDownloadEnabled: definitionRecord.homeownerDownloadEnabled,
        outstandingBalancePolicy: definitionRecord.outstandingBalancePolicy,
        walkInEnabled: definitionRecord.walkInEnabled,
        householdMemberEnabled: definitionRecord.householdMemberEnabled,
        manualSubjectEnabled: definitionRecord.manualSubjectEnabled,
        allowRegeneration: definitionRecord.allowRegeneration,
        allowPayLater: definitionRecord.allowPayLater,
        feeAmount: definitionRecord.feeAmount,
        currency: definitionRecord.currency,
        receiptRequired: definitionRecord.receiptRequired,
        financeClassification: definitionRecord.financeClassification,
        numberingFormat: defaultNumberingFormat(code),
        sequenceScope: definitionRecord.sequenceScope,
        validityDays: definitionRecord.validityDays,
        maxCopies: definitionRecord.maxCopies,
        qrEnabled: definitionRecord.qrEnabled,
        watermarkEnabled: definitionRecord.watermarkEnabled,
        signatoryOfficerId: definitionRecord.signatoryOfficerId,
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    if (definitionRecord.fields.length) {
      await tx.documentDefinitionField.createMany({ data: definitionRecord.fields.map((field) => ({ tenantId: admin.tenantId, definitionId: created.id, key: field.key, label: field.label, fieldType: field.fieldType, required: field.required, active: field.active, displayOrder: field.displayOrder, options: field.options ?? undefined, validation: field.validation ?? undefined, defaultValue: field.defaultValue ?? undefined })) });
    }
    await tx.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "DUPLICATE_DOCUMENT_DEFINITION", entityType: "DocumentDefinition", entityId: created.id, metadata: { sourceDefinitionId: definitionRecord.id, sourceCode: definitionRecord.code, code } } });
    return created;
  });
  revalidatePath("/admin/settings/document-definitions");
  redirect(`/admin/settings/document-definitions?edit=${copy.id}&success=duplicated&message=${encodeURIComponent(`${definitionRecord.displayName} duplicated.`)}`);
}

export async function saveDocumentDefinitionFieldsAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const definitionId = String(formData.get("definitionId") || "");
  const fail = (message: string): never => redirect(`/admin/settings/document-definitions?edit=${definitionId}&error=${encodeURIComponent(message)}`);
  const definition = await prisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId: admin.tenantId }, include: { requests: { select: { id: true }, take: 1 } } });
  if (!definition) fail("Document definition not found.");
  const definitionRecord = definition!;
  let fields: ReturnType<typeof parseFieldsJson> = [];
  try {
    fields = parseFieldsJson(String(formData.get("fieldsJson") || "[]"));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Field definitions are invalid.");
  }
  if (fields.length === 0) fail("At least one field is required.");
  const duplicateKey = firstDuplicate(fields.map((field) => field.key));
  if (duplicateKey) fail(`Field key ${duplicateKey} is duplicated.`);
  if (definitionRecord.requests.length) {
    const existing = await prisma.documentDefinitionField.findMany({ where: { tenantId: admin.tenantId, definitionId }, select: { key: true } });
    const existingKeys = new Set(existing.map((field) => field.key));
    const removed = [...existingKeys].filter((key) => !fields.some((field) => field.key === key));
    if (removed.length) fail("Field keys cannot be removed after requests exist. Deactivate the field instead.");
  }
  await platformPrisma.$transaction([
    platformPrisma.documentDefinitionField.deleteMany({ where: { tenantId: admin.tenantId, definitionId } }),
    platformPrisma.documentDefinitionField.createMany({ data: fields.map((field, index) => ({ ...field, tenantId: admin.tenantId, definitionId, displayOrder: index * 10 + 10 })) }),
    platformPrisma.documentDefinition.update({ where: { id: definitionId }, data: { updatedById: admin.id, version: { increment: 1 } } }),
    platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "UPDATE_DOCUMENT_DEFINITION_FIELDS", entityType: "DocumentDefinition", entityId: definitionId, metadata: { fieldCount: fields.length } } }),
  ]);
  revalidatePath("/admin/settings/document-definitions");
  revalidatePath("/portal/documents");
  redirect(`/admin/settings/document-definitions?edit=${definitionId}&success=fields&message=Definition%20fields%20saved.`);
}

export async function saveDocumentTemplateVersionAction(formData: FormData) {
  const admin = await requireDocumentTemplateAdmin();
  const definitionId = String(formData.get("definitionId") || "");
  const versionId = clean(formData.get("versionId"));
  const operation = String(formData.get("operation") || "saveDraft");
  const fail = (message: string): never => redirect(`/admin/settings/document-definitions/${definitionId}/templates${versionId ? `/${versionId}/edit` : ""}?error=${encodeURIComponent(message)}`);
  const definition = await prisma.documentDefinition.findFirst({ where: { id: definitionId, tenantId: admin.tenantId }, include: { templateSets: { include: { versions: true } } } });
  if (!definition) fail("Document definition not found.");
  const definitionRecord = definition!;
  if (operation === "createSet") {
    const set = await platformPrisma.$transaction(async (tx) => {
      const createdSet = await tx.documentTemplateSet.create({ data: { tenantId: admin.tenantId, definitionId, name: `${definitionRecord.displayName} Template`, description: definitionRecord.description, active: true } });
      const draft = await tx.documentTemplateVersion.create({ data: { tenantId: admin.tenantId, templateSetId: createdSet.id, version: 1, status: DocumentTemplateVersionStatus.DRAFT, schemaVersion: documentTemplateSchemaVersion, definitionJson: asJson(defaultTemplateDefinition(definitionRecord.displayName)), previewMetadata: asJson({ source: "professional-document-editor" }), createdById: admin.id } });
      await tx.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "CREATE_TEMPLATE_SET", entityType: "DocumentTemplateSet", entityId: createdSet.id, metadata: { definitionId, draftVersionId: draft.id } } });
      return { createdSet, draft };
    });
    revalidatePath("/admin/documents");
    redirect(`/admin/settings/document-definitions/${definitionId}/templates/${set.draft.id}/edit?success=created&message=Draft%20template%20created.`);
  }
  if (operation === "duplicateVersion") {
    const sourceId = String(formData.get("sourceVersionId") || "");
    const source = await prisma.documentTemplateVersion.findFirst({ where: { id: sourceId, tenantId: admin.tenantId, templateSet: { definitionId } }, include: { templateSet: true } });
    if (!source) fail("Template version not found.");
    const sourceRecord = source!;
    const maxVersion = Math.max(0, ...(await prisma.documentTemplateVersion.findMany({ where: { tenantId: admin.tenantId, templateSetId: sourceRecord.templateSetId }, select: { version: true } })).map((item) => item.version));
    const draft = await platformPrisma.documentTemplateVersion.create({ data: { tenantId: admin.tenantId, templateSetId: sourceRecord.templateSetId, version: maxVersion + 1, status: DocumentTemplateVersionStatus.DRAFT, schemaVersion: sourceRecord.schemaVersion, definitionJson: sourceRecord.definitionJson ?? asJson(defaultTemplateDefinition(definitionRecord.displayName)), previewMetadata: asJson({ duplicatedFrom: sourceRecord.id }), createdById: admin.id } });
    await platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "DUPLICATE_TEMPLATE_VERSION", entityType: "DocumentTemplateVersion", entityId: draft.id, metadata: { definitionId, sourceId } } });
    revalidatePath("/admin/documents");
    redirect(`/admin/settings/document-definitions/${definitionId}/templates/${draft.id}/edit?success=duplicated&message=Draft%20version%20created.`);
  }
  const current = versionId ? await prisma.documentTemplateVersion.findFirst({ where: { id: versionId, tenantId: admin.tenantId }, include: { templateSet: true } }) : null;
  if (!current || current.templateSet.definitionId !== definitionId || current.templateSet.tenantId !== admin.tenantId) fail("Template version not found.");
  const currentRecord = current!;
  if (operation === "retire") {
    if (currentRecord.status !== DocumentTemplateVersionStatus.PUBLISHED) fail("Only published versions can be retired.");
    await platformPrisma.$transaction([
      platformPrisma.documentTemplateVersion.update({ where: { id: currentRecord.id }, data: { status: DocumentTemplateVersionStatus.RETIRED } }),
      platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "RETIRE_TEMPLATE_VERSION", entityType: "DocumentTemplateVersion", entityId: currentRecord.id, metadata: { definitionId, version: currentRecord.version } } }),
    ]);
    revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates`);
    revalidatePath("/admin/documents");
    redirect(`/admin/settings/document-definitions/${definitionId}/templates?success=retired&message=Template%20version%20retired.`);
  }
  if (operation === "discardDraft") {
    if (currentRecord.status !== DocumentTemplateVersionStatus.DRAFT) fail("Only draft versions can be discarded.");
    await platformPrisma.$transaction([
      platformPrisma.documentTemplateVersion.update({ where: { id: currentRecord.id }, data: { status: DocumentTemplateVersionStatus.RETIRED } }),
      platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "DISCARD_TEMPLATE_DRAFT", entityType: "DocumentTemplateVersion", entityId: currentRecord.id, metadata: { definitionId, version: currentRecord.version } } }),
    ]);
    revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates`);
    revalidatePath("/admin/documents");
    redirect(`/admin/settings/document-definitions/${definitionId}/templates?success=discarded&message=Draft%20retired%20without%20deleting%20version%20history.`);
  }
  const loadedUpdatedAt = clean(formData.get("loadedUpdatedAt"));
  if ((operation === "saveDraft" || operation === "publish") && loadedUpdatedAt && currentRecord.updatedAt.toISOString() !== loadedUpdatedAt) fail("This draft changed in another session. Reload before saving to avoid overwriting someone else's work.");
  const templateDefinition = await templateDefinitionFromForm(formData, definitionRecord.displayName, admin.tenant.slug);
  const validation = validateTemplateDefinition(templateDefinition);
  if (!validation.valid) fail(validation.errors[0]);
  if (operation === "publish") {
    if (currentRecord.status !== DocumentTemplateVersionStatus.DRAFT) fail("Only draft versions can be published.");
    await platformPrisma.$transaction(async (tx) => {
      await tx.documentTemplateVersion.updateMany({ where: { tenantId: admin.tenantId, templateSetId: currentRecord.templateSetId, status: DocumentTemplateVersionStatus.PUBLISHED, id: { not: currentRecord.id } }, data: { status: DocumentTemplateVersionStatus.RETIRED } });
      const published = await tx.documentTemplateVersion.update({ where: { id: currentRecord.id }, data: { status: DocumentTemplateVersionStatus.PUBLISHED, schemaVersion: documentTemplateSchemaVersion, definitionJson: asJson(templateDefinition), publishedAt: new Date(), publishedById: admin.id } });
      await tx.documentDefinition.update({ where: { id: definitionId }, data: { assignedTemplateVersionId: published.id, updatedById: admin.id, version: { increment: 1 } } });
      await tx.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "PUBLISH_TEMPLATE_VERSION", entityType: "DocumentTemplateVersion", entityId: currentRecord.id, metadata: { definitionId, version: currentRecord.version } } });
    });
    revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates`);
    revalidatePath("/admin/settings/document-definitions");
    revalidatePath("/admin/documents");
    revalidatePath("/portal/documents");
    redirect(`/admin/settings/document-definitions/${definitionId}/templates?success=published&message=Template%20version%20published%20and%20assigned.`);
  }
  if (currentRecord.status !== DocumentTemplateVersionStatus.DRAFT) fail("Published versions are immutable. Duplicate this version to edit a new draft.");
  await platformPrisma.$transaction([
    platformPrisma.documentTemplateVersion.update({ where: { id: currentRecord.id }, data: { schemaVersion: documentTemplateSchemaVersion, definitionJson: asJson(templateDefinition), previewMetadata: asJson({ updatedById: admin.id, updatedAt: new Date().toISOString(), editor: "professional-document-editor" }) } }),
    platformPrisma.auditLog.create({ data: { tenantId: admin.tenantId, actorId: admin.id, module: "DOCUMENTS", action: "SAVE_TEMPLATE_DRAFT", entityType: "DocumentTemplateVersion", entityId: currentRecord.id, metadata: { definitionId, version: currentRecord.version, operation } } }),
  ]);
  revalidatePath(`/admin/settings/document-definitions/${definitionId}/templates/${currentRecord.id}/edit`);
  revalidatePath("/admin/documents");
  redirect(`/admin/settings/document-definitions/${definitionId}/templates/${currentRecord.id}/edit?success=saved&message=Draft%20saved.`);
}

export async function saveHouseholdMemberAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) redirect("/portal/documents?error=Homeowner%20profile%20not%20found.");
  const id = clean(formData.get("id"));
  const fullName = String(formData.get("fullName") || "").trim();
  const relationship = String(formData.get("relationship") || "").trim();
  if (fullName.length < 2 || relationship.length < 2) redirect("/portal/documents?error=Enter%20the%20household%20member%27s%20name%20and%20relationship.");
  const data = {
    fullName,
    relationship,
    birthDate: optionalDate(formData.get("birthDate")),
    civilStatus: clean(formData.get("civilStatus")),
    nationality: clean(formData.get("nationality")),
    address: clean(formData.get("address")),
    active: id ? formData.get("active") === "on" : true,
  };
  if (id) {
    const existing = await prisma.householdMember.findFirst({ where: { id, tenantId: user.tenantId, homeownerId } });
    if (!existing) redirect("/portal/documents?error=Household%20member%20not%20found.");
    await platformPrisma.householdMember.update({ where: { id }, data });
  } else {
    await prisma.householdMember.create({ data: { ...data, tenantId: user.tenantId, homeownerId } });
  }
  revalidatePath("/portal/documents");
  redirect("/portal/documents?success=member&message=Household%20member%20saved.");
}

export async function saveAdminHouseholdMemberAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const homeownerId = String(formData.get("homeownerId") || "");
  const id = String(formData.get("id") || "");
  const fail = (message: string): never => redirect(`/admin/homeowners/${homeownerId}?error=${encodeURIComponent(message)}`);
  if (!homeownerId || !id) fail("Household member not found.");
  const [homeowner, member] = await Promise.all([
    prisma.homeownerProfile.findFirst({ where: { id: homeownerId, tenantId: admin.tenantId }, select: { id: true } }),
    prisma.householdMember.findFirst({ where: { id, tenantId: admin.tenantId, homeownerId } }),
  ]);
  if (!homeowner || !member) fail("Household member not found for this tenant.");
  const fullName = String(formData.get("fullName") || "").trim();
  const relationship = String(formData.get("relationship") || "").trim();
  if (fullName.length < 2 || relationship.length < 2) fail("Enter the household member's name and relationship.");
  await platformPrisma.householdMember.update({
    where: { id },
    data: {
      fullName,
      relationship,
      birthDate: optionalDate(formData.get("birthDate")),
      civilStatus: clean(formData.get("civilStatus")),
      nationality: clean(formData.get("nationality")),
      address: clean(formData.get("address")),
      active: formData.get("active") === "on",
    },
  });
  revalidatePath(`/admin/homeowners/${homeownerId}`);
  revalidatePath("/portal/documents");
  redirect(`/admin/homeowners/${homeownerId}?success=household&message=Household%20member%20saved.`);
}

export async function toggleHouseholdMemberAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  const id = String(formData.get("id") || "");
  if (!homeownerId || !id) redirect("/portal/documents?error=Household%20member%20not%20found.");
  const member = await prisma.householdMember.findFirst({ where: { id, tenantId: user.tenantId, homeownerId } });
  if (!member) redirect("/portal/documents?error=Household%20member%20not%20found.");
  await platformPrisma.householdMember.update({ where: { id }, data: { active: !member.active } });
  revalidatePath("/portal/documents");
  redirect("/portal/documents?success=member&message=Household%20member%20status%20updated.");
}

function revalidateDocumentPages(id: string) { for (const path of ["/admin/documents", `/admin/documents/${id}`, "/portal/documents", `/documents/${id}`, `/documents/${id}/print`]) revalidatePath(path); }
function optionalDate(value: FormDataEntryValue | null) { const raw = String(value || "").trim(); if (!raw) return undefined; const date = new Date(`${raw}T00:00:00.000Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.valueOf())) throw new Error("Enter a valid date."); return date; }
function optionalDateFromString(value: string | undefined) { if (!value) return undefined; return optionalDate(value); }
function todayUtc() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
function oneYearFromToday() { const date = todayUtc(); date.setUTCFullYear(date.getUTCFullYear() + 1); return date; }
function clean(value: FormDataEntryValue | null) { return String(value || "").trim() || undefined; }
function nullableText(value: FormDataEntryValue | null) { const text = String(value || "").trim(); return text || null; }
function ordinal(day: number) { const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"; return `${day}${suffix}`; }
function ageAt(birthDate: Date, at: Date) { let age = at.getUTCFullYear() - birthDate.getUTCFullYear(); if (at.getUTCMonth() < birthDate.getUTCMonth() || (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate())) age -= 1; return Math.max(0, age); }
function requestStatusNote(status: DocumentRequestStatus, outstandingBalance: number) {
  if (status === DocumentRequestStatus.PAYMENT_PENDING) return "Submitted. Download remains blocked until document fee payment is confirmed.";
  if (status === DocumentRequestStatus.PENDING_APPROVAL) return outstandingBalance > 0 ? `Submitted with an outstanding balance of ${money(outstandingBalance)}. HOA approval is required.` : "Submitted and waiting for HOA approval.";
  if (status === DocumentRequestStatus.READY_FOR_DOWNLOAD) return "Submitted and prepared for immediate download.";
  return "Submitted by homeowner.";
}

type DocumentEditAuditDraft = ReturnType<typeof documentEditAudits>[number];
type DocumentHistoryDraft = { status: DocumentRequestStatus; actorId: string; note?: string | null };

async function createDocumentEditAudits(tx: Prisma.TransactionClient, tenantId: string, requestId: string, editAudits: DocumentEditAuditDraft[]) {
  if (!editAudits.length) return;
  await tx.documentRequestEditAudit.createMany({ data: editAudits.map((audit) => ({ ...audit, tenantId, requestId })) });
}

async function createDocumentHistories(tx: Prisma.TransactionClient, tenantId: string, requestId: string, histories: DocumentHistoryDraft[]) {
  if (!histories.length) return;
  await tx.documentRequestHistory.createMany({ data: histories.map((history) => ({ ...history, tenantId, requestId })) });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function documentEditAudits(requestValue: unknown, next: Record<string, unknown>, actorId: string) {
  const request = record(requestValue);
  const fields = ["purpose", "validityDate", "scheduledDate", "startTime", "endTime", "partyName", "vehicleDetails", "contractorDetails", "representativeName", "propertyDetails", "passType", "adminRemarks", "processedByOfficerId", "approvedByOfficerId", "numberOfCopies"];
  return fields.flatMap((fieldName) => {
    const previous = normalizeAuditValue(request[fieldName]);
    const current = normalizeAuditValue(next[fieldName]);
    if (previous === current) return [];
    return [{
      actorId,
      fieldName,
      previousValue: asJson({ value: previous }),
      newValue: asJson({ value: current }),
      note: "Admin reviewed document-visible request information.",
    }];
  });
}

function normalizeAuditValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value == null) return "";
  return String(value);
}

function decimalFromForm(value: FormDataEntryValue | null) {
  const raw = String(value || "0").trim().replaceAll(",", "");
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid fee amount.");
  return amount.toFixed(2);
}

function booleanFromForm(formData: FormData, name: string) {
  return formData.getAll(name).some((value) => ["true", "on", "1", "yes"].includes(String(value).toLowerCase()));
}

async function syncLegacyDefinitionConfiguration(
  tx: Prisma.TransactionClient,
  tenantId: string,
  type: DocumentType,
  definitionId: string,
  data: {
    displayName: string;
    description: string | null;
    active: boolean;
    deliveryMode: DocumentDeliveryMode;
    approvalRequired: boolean;
    paymentRequired: boolean;
    paymentBeforeApproval: boolean;
    allowImmediateDownload: boolean;
    requiresAdminReview: boolean;
    allowRegeneration: boolean;
    homeownerDownloadEnabled: boolean;
    validityDays: number | null;
    maxCopies: number;
    feeAmount: string;
    allowPayLater: boolean;
    signatoryOfficerId: string | null;
  },
  adminId: string,
) {
  await tx.documentTypeConfiguration.updateMany({
    where: { tenantId, type },
    data: {
      definitionId,
      displayName: data.displayName,
      description: data.description,
      active: data.active,
      deliveryMode: data.deliveryMode,
      approvalRequired: data.approvalRequired,
      paymentRequired: data.paymentRequired,
      paymentBeforeApproval: data.paymentBeforeApproval,
      allowImmediateDownload: data.allowImmediateDownload,
      allowRegeneration: data.allowRegeneration,
      requiresAdminReview: data.requiresAdminReview,
      homeownerDownloadEnabled: data.homeownerDownloadEnabled,
      validityDays: data.validityDays,
      maxCopies: data.maxCopies,
      feeAmount: data.feeAmount,
      allowPayLater: data.allowPayLater,
      signatoryOfficerId: data.signatoryOfficerId,
      updatedById: adminId,
      version: { increment: 1 },
    },
  });
}

function firstDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function uniqueCopyCode(code: string) {
  return `${code.replace(/_COPY(_[A-Z0-9]{4})?$/, "")}_COPY_${randomUUID().slice(0, 4).toUpperCase()}`;
}

async function templateDefinitionFromForm(formData: FormData, title: string, tenantSlug: string) {
  const json = clean(formData.get("templateDefinitionJson"));
  if (json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("Template definition payload is invalid.");
    }
    const definition = normalizeTemplateDefinition(parsed, title);
    return applyTemplateImageUpload(definition, formData, tenantSlug);
  }
  const ids = formData.getAll("blockId").map((value) => String(value || "").trim()).filter(Boolean);
  const types = formData.getAll("blockType").map(String);
  const labels = formData.getAll("blockLabel").map(String);
  const texts = formData.getAll("blockText").map(String);
  const bindings = formData.getAll("blockBinding").map(String);
  const visibleValues = new Set(formData.getAll("blockVisible").map(String));
  const removeValues = new Set(formData.getAll("blockRemove").map(String));
  const addType = String(formData.get("addBlockType") || "");
  const operation = String(formData.get("operation") || "");
  const blocks: DocumentTemplateBlock[] = ids.flatMap((id, index) => {
    if (removeValues.has(id)) return [];
    const type = documentTemplateBlockTypes.includes(types[index] as DocumentTemplateBlockType) ? types[index] as DocumentTemplateBlockType : "text";
    const binding = bindings[index] as AllowedDocumentPlaceholder;
    return [{
      id,
      type,
      section: "body",
      label: labels[index]?.trim() || undefined,
      content: texts[index]?.trim() || undefined,
      text: texts[index]?.trim() || undefined,
      binding: binding || undefined,
      order: (index + 1) * 10,
      visible: visibleValues.has(id),
    }];
  });
  const move = operation.match(/^move:(.+):(up|down)$/);
  if (move) {
    const index = blocks.findIndex((block) => block.id === move[1]);
    const target = move[2] === "up" ? index - 1 : index + 1;
    if (index >= 0 && target >= 0 && target < blocks.length) [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  }
  if (addType && documentTemplateBlockTypes.includes(addType as DocumentTemplateBlockType)) {
    blocks.push({ id: `block-${randomUUID().slice(0, 8)}`, section: "body", type: addType as DocumentTemplateBlockType, label: addType.replace(/([A-Z])/g, " $1"), content: "", text: "", binding: undefined, order: (blocks.length + 1) * 10, visible: true });
  }
  return normalizeTemplateDefinition({ schemaVersion: documentTemplateSchemaVersion, page: { format: "A4", orientation: "portrait" }, blocks }, title);
}

async function applyTemplateImageUpload(definition: ReturnType<typeof normalizeTemplateDefinition>, formData: FormData, tenantSlug: string) {
  const uploadBlockId = clean(formData.get("imageUploadBlockId"));
  const upload = formData.get("imageFile");
  if (!uploadBlockId || !upload || typeof upload !== "object" || !("arrayBuffer" in upload) || !("size" in upload) || Number(upload.size) <= 0) return definition;
  const file = upload as File;
  if (file.size > 5 * 1024 * 1024) throw new Error("Template image must be 5MB or smaller.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "";
  if (!extension) throw new Error("Template image must be PNG, JPEG, or WebP.");
  const directory = tenantUploadDirectory(tenantSlug, "settings", "document-templates");
  await mkdir(directory, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  const target = path.join(directory, fileName);
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  const publicPath = `/uploads/settings/${tenantSlug}/document-templates/${fileName}`;
  const sections = {
    header: definition.sections.header.map((block) => block.id === uploadBlockId ? { ...block, image: { ...block.image, src: publicPath, alt: block.image?.alt || block.label || "Template image" } } : block),
    body: definition.sections.body.map((block) => block.id === uploadBlockId ? { ...block, image: { ...block.image, src: publicPath, alt: block.image?.alt || block.label || "Template image" } } : block),
    footer: definition.sections.footer.map((block) => block.id === uploadBlockId ? { ...block, image: { ...block.image, src: publicPath, alt: block.image?.alt || block.label || "Template image" } } : block),
  };
  return normalizeTemplateDefinition({ ...definition, sections }, definition.blocks.find((block) => block.type === "documentTitle")?.content || "Official HOA Document");
}

function parseFieldsJson(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Field definitions must be valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("Field definitions must be an array.");
  return parsed.map((entry, index) => {
    const item = record(entry);
    const key = String(item.key || "").trim();
    const label = String(item.label || "").trim();
    const fieldType = String(item.fieldType || DocumentFieldType.TEXT) as DocumentFieldType;
    if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(key)) throw new Error(`Field ${index + 1} has an invalid key.`);
    if (!label) throw new Error(`Field ${index + 1} needs a label.`);
    if (!Object.values(DocumentFieldType).includes(fieldType)) throw new Error(`Field ${index + 1} has an invalid type.`);
    return {
      key,
      label,
      fieldType,
      required: Boolean(item.required),
      options: Array.isArray(item.options) ? asJson(item.options.map((option) => {
        if (option && typeof option === "object" && !Array.isArray(option)) {
          const value = String(record(option).value ?? record(option).label ?? "").trim();
          const label = String(record(option).label ?? record(option).value ?? "").trim();
          return value ? { label: label || value, value } : null;
        }
        const value = String(option ?? "").trim();
        return value || null;
      }).filter(Boolean)) : undefined,
      validation: item.validation ? asJson(item.validation) : undefined,
      defaultValue: Object.hasOwn(item, "defaultValue") && item.defaultValue !== "" && item.defaultValue !== undefined ? asJson(item.defaultValue) : undefined,
      active: item.active !== false,
    };
  });
}

async function generateDocumentForRequest(id: string, actorId: string, reason: string) {
  const request = await prisma.documentRequest.findFirst({
    where: { id },
    include: {
      homeowner: { include: { user: true } },
      configuration: { include: { template: true } },
      definition: { include: { assignedTemplateVersion: { include: { templateSet: true } } } },
    },
  });
  if (!request) throw new Error("Document request not found.");
  const publishedTemplate = request.templateVersionIdSnapshot ? await prisma.documentTemplateVersion.findFirst({ where: { tenantId: request.tenantId, id: request.templateVersionIdSnapshot, status: DocumentTemplateVersionStatus.PUBLISHED } }) : null;
  const template = request.configuration?.template ?? (request.type ? await prisma.documentTemplate.findFirst({ where: { tenantId: request.tenantId, type: request.type } }) : null);
  const templateBody = template?.active ? template.body : structuredTemplateText(request.templateDefinitionSnapshot ?? publishedTemplate?.definitionJson);
  if (!templateBody) throw new Error("Document template is inactive or missing.");
  const [payments, constructionBonds, association, officers] = await Promise.all([
    prisma.payment.aggregate({ where: { tenantId: request.tenantId, homeownerId: request.homeownerId, status: "ACTIVE" }, _sum: { amount: true } }),
    prisma.collection.findMany({ where: { tenantId: request.tenantId, homeownerId: request.homeownerId, type: "CONSTRUCTION_BOND", refundable: true } }),
    getAssociationSettings(request.tenantId),
    getActiveOrganizationOfficers(request.tenantId),
  ]);
  const data = record(request.reviewedDataSnapshot ?? request.requestDataSnapshot);
  const fields = record(data.fields ?? data);
  const subject = record(request.subjectSnapshot);
  const now = new Date();
  const verificationCode = randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
  await platformPrisma.$transaction(async (tx) => {
    const documentNumber = request.documentNumber ?? (request.definition
      ? await allocateDefinitionDocumentNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, request.definition, now)
      : request.type
        ? await allocateDocumentNumber(tx as unknown as Prisma.TransactionClient, request.tenantId, request.type, now)
        : (() => { throw new Error("Document definition is required before generating a custom document."); })());
    const nextVersion = request.currentVersion > 0 ? request.currentVersion + 1 : 1;
    const subjectName = textValue(subject.fullName) || request.homeowner.user.name;
    const subjectAddress = textValue(subject.address) || request.homeowner.address;
    const purpose = textValue(fields.purpose) || request.purpose || "official purposes";
    const validityDate = request.validityDate ?? (request.configuration?.validityDays ? new Date(now.getTime() + request.configuration.validityDays * 86400000) : null);
    const content = renderDocumentTemplate(templateBody, {
      associationName: association.name,
      homeownerName: subjectName,
      propertyAddress: subjectAddress,
      block: textValue(subject.block) || request.homeowner.block,
      lot: textValue(subject.lot) || request.homeowner.lot,
      purpose,
      issueDate: shortDate(now),
      validityDate: validityDate ? shortDate(validityDate) : "Not specified",
      scheduledDate: request.scheduledDate ? shortDate(request.scheduledDate) : textValue(fields.scheduledDate) || "Not specified",
      startTime: request.startTime || textValue(fields.startTime),
      endTime: request.endTime || textValue(fields.endTime),
      passType: (request.passType || textValue(fields.passType)).replaceAll("_", " "),
      vehicleDetails: request.vehicleDetails || textValue(fields.vehicleDetails) || "None specified",
      partyName: request.partyName || textValue(fields.partyName),
      contractorDetails: request.contractorDetails || textValue(fields.contractorDetails) || "None specified",
      totalPayments: money(Number(payments._sum.amount ?? 0)),
      constructionBondBalance: money(constructionBonds.reduce((sum, item) => sum + Number(item.amount) - Number(item.amountRefunded) - Number(item.amountForfeited), 0)),
      documentNumber,
      association_name: association.name,
      association_address: association.address,
      association_contact: association.contactNumber,
      association_email: association.email,
      sec_registration_number: association.secRegistrationNumber,
      homeowner_name: subjectName,
      property_address: subjectAddress,
      block_lot: textValue(subject.accountLabel) || `Block ${request.homeowner.block}, Lot ${request.homeowner.lot}`,
      document_number: documentNumber,
      request_date: shortDate(request.requestedAt),
      approval_date: shortDate(now),
      validity_date: validityDate ? shortDate(validityDate) : "Not specified",
      processed_by: "System",
      approved_by: "System",
      qr_verification_code: verificationCode,
      remarks: request.adminRemarks || request.remarks || textValue(fields.remarks),
      issue_day_ordinal: ordinal(now.getUTCDate()),
      issue_month_year: now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      office_location: association.address,
      age: request.homeowner.birthDate ? String(ageAt(request.homeowner.birthDate, now)) : "Not specified",
      civil_status: textValue(subject.civilStatus) || request.homeowner.civilStatus || "Not specified",
      citizenship: textValue(subject.nationality) || request.homeowner.citizenship || "Not specified",
      occupation: request.homeowner.occupation || "Not specified",
      residency_date: request.homeowner.residencyDate ? shortDate(request.homeowner.residencyDate) : textValue(fields.residencyStartDate) || "Not specified",
      phase: request.homeowner.phase || association.name,
      property_type: request.homeowner.propertyType || "Not specified",
      occupancy_status: request.homeowner.occupancyStatus || "Not specified",
      contact_number: request.homeowner.phone,
    });
    const snapshot = asJson({ requestDataSnapshot: request.requestDataSnapshot, reviewedDataSnapshot: request.reviewedDataSnapshot, subjectSnapshot: request.subjectSnapshot, configurationId: request.configurationId, configurationVersion: request.configurationVersion });
    await tx.documentRequest.update({
      where: { id: request.id },
      data: {
        status: DocumentRequestStatus.READY_FOR_DOWNLOAD,
        documentNumber,
        generatedAt: now,
        readyForDownloadAt: now,
        issueDate: now,
        templateVersion: template?.version ?? publishedTemplate?.version ?? request.templateVersionSnapshot ?? 1,
        templateSnapshot: templateBody,
        templateVersionSnapshot: template?.version ?? publishedTemplate?.version ?? request.templateVersionSnapshot,
        templateVersionIdSnapshot: publishedTemplate?.id ?? request.templateVersionIdSnapshot,
        templateIdSnapshot: template?.id ?? request.templateIdSnapshot,
        templateDefinitionSnapshot: request.templateDefinitionSnapshot ?? publishedTemplate?.definitionJson ?? undefined,
        generatedContent: content,
        verificationCode,
        currentVersion: nextVersion,
        associationSnapshot: asJson(association),
        homeownerSnapshot: request.subjectSnapshot ?? asJson({ name: request.homeowner.user.name, email: request.homeowner.user.email, address: request.homeowner.address, block: request.homeowner.block, lot: request.homeowner.lot, phone: request.homeowner.phone }),
        organizationSnapshot: asJson(officers.map(officerSnapshot)),
      },
    });
    await createDocumentHistories(tx, request.tenantId, request.id, [{ status: DocumentRequestStatus.READY_FOR_DOWNLOAD, actorId, note: reason }]);
    await tx.documentVersion.create({ data: { tenantId: request.tenantId, requestId: request.id, definitionId: request.definitionId, templateVersionId: publishedTemplate?.id ?? null, version: nextVersion, documentNumber, verificationCode, templateVersion: template?.version ?? publishedTemplate?.version ?? request.templateVersionSnapshot ?? 1, templateSnapshot: templateBody, generatedContent: content, requestSnapshot: snapshot, definitionSnapshot: request.definitionSnapshot ?? undefined, templateDefinitionSnapshot: request.templateDefinitionSnapshot ?? publishedTemplate?.definitionJson ?? undefined, generatedById: actorId, reason } });
  });
}

function structuredTemplateText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return renderTemplateDefinitionText(value);
}

function documentRequestLabel(request: { type?: DocumentType | null; definition?: { displayName: string } | null; definitionSnapshot?: unknown; configuration?: { displayName: string | null } | null }) {
  const snapshot = record(request.definitionSnapshot);
  return String(snapshot.displayName || request.definition?.displayName || request.configuration?.displayName || documentTypeLabel(request.type));
}
