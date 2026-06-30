"use server";

import { randomUUID } from "node:crypto";
import { DocumentRequestStatus, DocumentType, NotificationType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAssociationSettings } from "@/lib/system-settings";
import { asJson, getActiveOrganizationOfficers, officerSnapshot } from "@/lib/organization";
import { allocateDocumentNumber, documentTypeOptions, renderDocumentTemplate } from "@/lib/services/documents";
import { money, shortDate } from "@/lib/utils";
import { sendEmailNotification } from "@/lib/services/notifications";

export async function submitDocumentRequestAction(formData: FormData) {
  const user = await requireUser(Role.HOMEOWNER);
  const homeownerId = user.homeownerProfile?.id;
  if (!homeownerId) redirect("/portal/documents?error=Homeowner%20profile%20not%20found.");
  const type = String(formData.get("type") || "") as DocumentType;
  if (!documentTypeOptions.some((item) => item.value === type)) redirect("/portal/documents?error=Select%20a%20valid%20document%20type.");
  const purpose = String(formData.get("purpose") || "").trim();
  const scheduledDate = optionalDate(formData.get("scheduledDate"));
  const startTime = clean(formData.get("startTime"));
  const endTime = clean(formData.get("endTime"));
  const passType = clean(formData.get("passType"));
  const vehicleDetails = clean(formData.get("vehicleDetails"));
  const partyName = clean(formData.get("partyName"));
  const contractorDetails = clean(formData.get("contractorDetails"));
  const representativeName = clean(formData.get("representativeName"));
  const propertyDetails = clean(formData.get("propertyDetails"));
  const remarks = clean(formData.get("remarks"));
  if (!purpose || purpose.length < 3) redirect("/portal/documents?error=Enter%20the%20purpose%20of%20the%20request.");
  if (purpose.length > 500 || (remarks?.length ?? 0) > 1000) redirect("/portal/documents?error=Request%20details%20are%20too%20long.");
  if ((type === DocumentType.GATE_PASS || type === DocumentType.MOVE_IN_OUT_PASS) && (!scheduledDate || !startTime || !endTime || !partyName)) redirect("/portal/documents?error=Pass%20date%2C%20time%2C%20and%20authorized%20party%20are%20required.");
  if (scheduledDate && scheduledDate < todayUtc()) redirect("/portal/documents?error=Pass%20and%20validity%20dates%20must%20be%20today%20or%20later.");
  if (type === DocumentType.MOVE_IN_OUT_PASS && !["MOVE_IN", "MOVE_OUT"].includes(passType || "")) redirect("/portal/documents?error=Select%20Move%20In%20or%20Move%20Out.");

  const unpaid = await prisma.bill.aggregate({ where: { homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } });
  const outstandingBalance = Number(unpaid._sum.balance ?? 0);
  const template = await prisma.documentTemplate.findUnique({ where: { type } });
  if (!template?.active) redirect("/portal/documents?error=This%20document%20type%20is%20currently%20unavailable.");

  const request = await prisma.documentRequest.create({
    data: {
      homeownerId, type, purpose, remarks, scheduledDate, startTime, endTime, passType, origin: "HOMEOWNER", initiatedById: user.id,
      vehicleDetails, partyName, contractorDetails, representativeName, propertyDetails,
      outstandingBalanceAtRequest: outstandingBalance,
      status: DocumentRequestStatus.SUBMITTED,
      histories: { create: { status: DocumentRequestStatus.SUBMITTED, actorId: user.id, note: outstandingBalance > 0 ? `Submitted with an outstanding balance of ${money(outstandingBalance)}. Download remains restricted until settlement or admin override.` : "Submitted by homeowner." } },
    },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, module: "DOCUMENTS", action: "SUBMIT_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: request.id, metadata: { type, purpose, outstandingBalance, downloadRestricted: outstandingBalance > 0 } } });
  revalidateDocumentPages(request.id);
  redirect("/portal/documents?success=submitted&message=Document%20request%20submitted%20successfully.");
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
  const request = await prisma.documentRequest.findUnique({ where: { id }, include: { homeowner: { include: { user: true } } } });
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
  const allowDownloadDespiteBalance = formData.get("allowDownloadDespiteBalance") === "on";
  const downloadOverrideReason = clean(formData.get("downloadOverrideReason"));
  if ((operation === "approve" || operation === "regenerate") && (request.type === DocumentType.GATE_PASS || request.type === DocumentType.MOVE_IN_OUT_PASS) && (!validityDate || !scheduledDate || !partyName)) fail("Pass validity date, scheduled date, and visitor or contractor name are required.");
  if (operation !== "reject" && ((validityDate && validityDate < todayUtc()) || (scheduledDate && scheduledDate < todayUtc()))) fail("Validity and scheduled dates must be today or later.");
  if (operation === "review") {
    if (request.status !== DocumentRequestStatus.SUBMITTED && request.status !== DocumentRequestStatus.UNDER_REVIEW) fail("Only submitted requests can be reviewed.");
    await prisma.documentRequest.update({ where: { id }, data: { status: DocumentRequestStatus.UNDER_REVIEW, reviewedAt: new Date(), processedById: admin.id, adminRemarks, purpose, validityDate, scheduledDate, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType, processedByOfficerId, approvedByOfficerId, histories: { create: { status: DocumentRequestStatus.UNDER_REVIEW, actorId: admin.id, note: adminRemarks || "Review started." } } } });
  } else if (operation === "reject") {
    if (!adminRemarks) fail("A rejection reason is required.");
    if (request.status === DocumentRequestStatus.GENERATED || request.status === DocumentRequestStatus.DOWNLOADED) fail("Generated documents cannot be rejected.");
    await prisma.documentRequest.update({ where: { id }, data: { status: DocumentRequestStatus.REJECTED, reviewedAt: new Date(), processedById: admin.id, adminRemarks, histories: { create: { status: DocumentRequestStatus.REJECTED, actorId: admin.id, note: adminRemarks } } } });
  } else if (operation === "approve" || operation === "regenerate") {
    const regenerating = operation === "regenerate";
    if (!regenerating && request.status !== DocumentRequestStatus.SUBMITTED && request.status !== DocumentRequestStatus.UNDER_REVIEW) fail("Only pending requests can be approved.");
    if (regenerating && (!request.generatedContent || !request.documentNumber || !request.verificationCode || request.archivedAt)) fail("Only active generated documents can be regenerated.");
    const [unpaid, template, payments, constructionBonds, association, officers] = await Promise.all([
      prisma.bill.aggregate({ where: { homeownerId: request.homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } }),
      prisma.documentTemplate.findUnique({ where: { type: request.type } }),
      prisma.payment.aggregate({ where: { homeownerId: request.homeownerId, status: "ACTIVE" }, _sum: { amount: true } }),
      prisma.collection.findMany({ where: { homeownerId: request.homeownerId, type: "CONSTRUCTION_BOND", refundable: true } }),
      getAssociationSettings(),
      getActiveOrganizationOfficers(),
    ]);
    if (!template?.active) return fail("The document template is inactive or missing.");
    const outstandingBalance = Number(unpaid._sum.balance ?? 0);
    if (allowDownloadDespiteBalance && outstandingBalance > 0 && !downloadOverrideReason) fail("Enter a reason when allowing download despite an outstanding balance.");
    const processedOfficer = officers.find((officer) => officer.id === processedByOfficerId) || null;
    const approvedOfficer = officers.find((officer) => officer.id === approvedByOfficerId) || null;
    if (processedByOfficerId && !processedOfficer) fail("Select an active processing officer.");
    if (approvedByOfficerId && !approvedOfficer) fail("Select an active approving officer.");
    const now = new Date();
    const verificationCode = randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
    await prisma.$transaction(async (tx) => {
      const documentNumber = regenerating ? request.documentNumber! : await allocateDocumentNumber(tx, request.type, now);
      const nextVersion = regenerating ? Math.max(1, request.currentVersion) + 1 : 1;
      const content = renderDocumentTemplate(template.body, {
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
      await tx.documentRequest.update({ where: { id }, data: { status: DocumentRequestStatus.GENERATED, documentNumber, purpose, validityDate, scheduledDate, startTime, endTime, partyName, vehicleDetails, contractorDetails, representativeName, propertyDetails, passType, outstandingBalanceAtRequest: outstandingBalance, allowDownloadDespiteBalance, downloadOverrideReason: allowDownloadDespiteBalance ? downloadOverrideReason : null, downloadOverrideAt: allowDownloadDespiteBalance ? now : null, downloadOverrideById: allowDownloadDespiteBalance ? admin.id : null, reviewedAt: request.reviewedAt ?? now, approvedAt: now, generatedAt: now, downloadedAt: null, processedById: admin.id, approvedById: admin.id, processedByOfficerId: processedOfficer?.id, approvedByOfficerId: approvedOfficer?.id, adminRemarks, templateVersion: template.version, templateSnapshot: template.body, generatedContent: content, verificationCode, currentVersion: nextVersion, associationSnapshot: asJson(association), homeownerSnapshot: asJson({ name: request.homeowner.user.name, email: request.homeowner.user.email, address: request.homeowner.address, block: request.homeowner.block, lot: request.homeowner.lot, phone: request.homeowner.phone, birthDate: request.homeowner.birthDate, civilStatus: request.homeowner.civilStatus, citizenship: request.homeowner.citizenship, occupation: request.homeowner.occupation, residencyDate: request.homeowner.residencyDate, phase: request.homeowner.phase, propertyType: request.homeowner.propertyType, occupancyStatus: request.homeowner.occupancyStatus }), organizationSnapshot: asJson(officers.map(officerSnapshot)), processedOfficerSnapshot: processedOfficer ? asJson(officerSnapshot(processedOfficer)) : undefined, approvedOfficerSnapshot: approvedOfficer ? asJson(officerSnapshot(approvedOfficer)) : undefined, histories: { create: regenerating ? [{ status: DocumentRequestStatus.GENERATED, actorId: admin.id, note: `Regenerated ${documentNumber} as version ${nextVersion}. Previous versions remain archived.` }] : [{ status: DocumentRequestStatus.APPROVED, actorId: admin.id, note: adminRemarks || "Approved by administrator." }, { status: DocumentRequestStatus.GENERATED, actorId: admin.id, note: `Generated as ${documentNumber}, version 1.${outstandingBalance > 0 && !allowDownloadDespiteBalance ? " Download restricted while balance remains unpaid." : ""}` }] } } });
      await tx.documentVersion.create({ data: { requestId: id, version: nextVersion, documentNumber, verificationCode, templateVersion: template.version, templateSnapshot: template.body, generatedContent: content, requestSnapshot, generatedById: admin.id, reason: regenerating ? adminRemarks || "Approved document edited and regenerated." : request.origin === "ADMIN" ? "Admin-initiated document generation." : "Homeowner request approved and generated." } });
      await tx.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: regenerating ? "EDIT_AND_REGENERATE" : request.origin === "ADMIN" ? "ADMIN_GENERATE_DOCUMENT" : "APPROVE_AND_GENERATE", entityType: "DocumentRequest", entityId: id, metadata: { documentNumber, version: nextVersion, templateVersion: template.version, verificationCode, outstandingBalance, allowDownloadDespiteBalance, downloadOverrideReason, oldValue: regenerating ? { version: request.currentVersion, purpose: request.purpose, validityDate: request.validityDate, propertyDetails: request.propertyDetails, vehicleDetails: request.vehicleDetails, partyName: request.partyName, contractorDetails: request.contractorDetails } : null, newValue: requestSnapshot, role: admin.role, remarks: adminRemarks } } });
      if (allowDownloadDespiteBalance && outstandingBalance > 0) await tx.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "DOWNLOAD_BALANCE_OVERRIDE", entityType: "DocumentRequest", entityId: id, metadata: { documentNumber, outstandingBalance, reason: downloadOverrideReason } } });
    });
  } else {
    fail("Select a valid request action.");
  }
  if (operation === "approve" || operation === "reject") {
    const approved = operation === "approve";
    const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "https://pagsibol-hoa.tail2abf68.ts.net";
    await sendEmailNotification({
      recipientId: request.homeowner.user.id,
      email: request.homeowner.user.email,
      subject: approved ? "Your HOA document request was approved" : "Update on your HOA document request",
      heading: approved ? "Document approved" : "Document request rejected",
      message: approved ? `Hello ${request.homeowner.user.name},\nYour ${request.type.replaceAll("_", " ").toLowerCase()} request has been approved and generated. You can review it in the homeowner portal.` : `Hello ${request.homeowner.user.name},\nYour ${request.type.replaceAll("_", " ").toLowerCase()} request was not approved.\nReason: ${adminRemarks || "Please contact the HOA office for details."}`,
      type: approved ? NotificationType.DOCUMENT_APPROVED : NotificationType.DOCUMENT_REJECTED,
      actionLabel: "View document requests",
      actionUrl: `${appUrl}/portal/documents`,
    }).catch(() => undefined);
  }
  await prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: operation.toUpperCase(), entityType: "DocumentRequest", entityId: id, metadata: { adminRemarks } } });
  revalidateDocumentPages(id);
  redirect(`${returnPath}?success=${operation}&message=${encodeURIComponent(operation === "approve" ? "Document approved and generated successfully." : operation === "regenerate" ? "Document updated and regenerated. The previous version was preserved." : operation === "review" ? "Review details saved successfully." : "Request rejected successfully.")}`);
}

export async function generateManualDocumentAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const homeownerId = String(formData.get("homeownerId") || "");
  const type = String(formData.get("type") || "") as DocumentType;
  const purpose = clean(formData.get("purpose"));
  if (!homeownerId || !documentTypeOptions.some((item) => item.value === type) || !purpose) redirect("/admin/documents/new?error=Select%20a%20homeowner%2C%20document%20type%2C%20and%20enter%20a%20purpose.");
  const homeowner = await prisma.homeownerProfile.findUnique({ where: { id: homeownerId } });
  if (!homeowner) redirect("/admin/documents/new?error=Homeowner%20not%20found.");
  const unpaid = await prisma.bill.aggregate({ where: { homeownerId, archivedAt: null, balance: { gt: 0 } }, _sum: { balance: true } });
  const request = await prisma.documentRequest.create({ data: { homeownerId, type, origin: "ADMIN", initiatedById: admin.id, status: DocumentRequestStatus.SUBMITTED, purpose, remarks: clean(formData.get("remarks")), validityDate: optionalDate(formData.get("validityDate")), scheduledDate: optionalDate(formData.get("scheduledDate")), startTime: clean(formData.get("startTime")), endTime: clean(formData.get("endTime")), passType: clean(formData.get("passType")), vehicleDetails: clean(formData.get("vehicleDetails")), partyName: clean(formData.get("partyName")), contractorDetails: clean(formData.get("contractorDetails")), representativeName: clean(formData.get("representativeName")), propertyDetails: clean(formData.get("propertyDetails")) || homeowner.address, outstandingBalanceAtRequest: Number(unpaid._sum.balance ?? 0), histories: { create: { status: DocumentRequestStatus.SUBMITTED, actorId: admin.id, note: "Created by administrator for a walk-in or office transaction." } } } });
  await prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "ADMIN_INITIATE_DOCUMENT", entityType: "DocumentRequest", entityId: request.id, metadata: { homeownerId, type, role: admin.role, purpose } } });
  formData.set("id", request.id); formData.set("operation", "approve"); formData.set("returnTo", `/admin/documents/${request.id}`);
  return processDocumentRequestAction(formData);
}

export async function archiveDocumentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN); const id = String(formData.get("id") || ""); const reason = clean(formData.get("reason"));
  const existing = await prisma.documentRequest.findUnique({ where: { id } }); if (!existing || existing.archivedAt) redirect("/admin/documents?error=Document%20request%20not%20found%20or%20already%20archived.");
  await prisma.$transaction([prisma.documentRequest.update({ where: { id }, data: { archivedAt: new Date(), archivedById: admin.id, archiveReason: reason || "Archived by administrator." } }), prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "ARCHIVE_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: id, metadata: { role: admin.role, oldValue: { archivedAt: null }, newValue: { archived: true }, remarks: reason } } })]);
  revalidateDocumentPages(id); redirect("/admin/documents?success=archived&message=Document%20request%20archived%20successfully.");
}

export async function restoreDocumentRequestAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN); const id = String(formData.get("id") || ""); const existing = await prisma.documentRequest.findUnique({ where: { id } }); if (!existing?.archivedAt) redirect("/admin/documents/archive?error=Archived%20document%20not%20found.");
  await prisma.$transaction([prisma.documentRequest.update({ where: { id }, data: { archivedAt: null, archivedById: null, archiveReason: null } }), prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: "RESTORE_DOCUMENT_REQUEST", entityType: "DocumentRequest", entityId: id, metadata: { role: admin.role, oldValue: { archivedAt: existing.archivedAt }, newValue: { archived: false } } } })]);
  revalidateDocumentPages(id); revalidatePath("/admin/documents/archive"); redirect(`/admin/documents/${id}?success=restored&message=Document%20request%20restored%20successfully.`);
}

export async function saveDocumentTemplateAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const type = String(formData.get("type") || "") as DocumentType;
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const active = formData.get("active") === "on";
  if (!documentTypeOptions.some((item) => item.value === type) || title.length < 3 || body.length < 20) redirect("/admin/document-templates?error=Enter%20a%20valid%20title%20and%20template%20body.");
  const existing = await prisma.documentTemplate.findUnique({ where: { type } });
  const template = await prisma.documentTemplate.upsert({ where: { type }, create: { type, title, body, active, updatedById: admin.id }, update: { title, body, active, updatedById: admin.id, version: { increment: 1 } } });
  await prisma.auditLog.create({ data: { actorId: admin.id, module: "DOCUMENTS", action: existing ? "UPDATE_TEMPLATE" : "CREATE_TEMPLATE", entityType: "DocumentTemplate", entityId: template.id, metadata: { type, version: template.version, active } } });
  revalidatePath("/admin/document-templates");
  revalidatePath("/portal/documents");
  redirect(`/admin/document-templates?success=saved&message=${encodeURIComponent(`${title} template saved as version ${template.version}. Existing generated documents were not changed.`)}`);
}

function revalidateDocumentPages(id: string) { for (const path of ["/admin/documents", `/admin/documents/${id}`, "/portal/documents", `/documents/${id}`, `/documents/${id}/print`]) revalidatePath(path); }
function optionalDate(value: FormDataEntryValue | null) { const raw = String(value || "").trim(); if (!raw) return undefined; const date = new Date(`${raw}T00:00:00.000Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.valueOf())) throw new Error("Enter a valid date."); return date; }
function todayUtc() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); }
function oneYearFromToday() { const date = todayUtc(); date.setUTCFullYear(date.getUTCFullYear() + 1); return date; }
function clean(value: FormDataEntryValue | null) { return String(value || "").trim() || undefined; }
function ordinal(day: number) { const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"; return `${day}${suffix}`; }
function ageAt(birthDate: Date, at: Date) { let age = at.getUTCFullYear() - birthDate.getUTCFullYear(); if (at.getUTCMonth() < birthDate.getUTCMonth() || (at.getUTCMonth() === birthDate.getUTCMonth() && at.getUTCDate() < birthDate.getUTCDate())) age -= 1; return Math.max(0, age); }
