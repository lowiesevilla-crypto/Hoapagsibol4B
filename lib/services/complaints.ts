import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compare, hash } from "bcryptjs";
import {
  ComplaintAttachmentVisibility,
  ComplaintIdentityAccessStatus,
  ComplaintMalwareScanStatus,
  ComplaintPrivacyMode,
  ComplaintPriority,
  ComplaintSeverity,
  ComplaintStatus,
  ComplaintTimelineEventType,
  ComplaintVisibility,
  Role,
  TenantModule,
  type User,
} from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { platformPrisma, prisma } from "@/lib/db";
import { rateLimitAvailable, recordRateLimitFailure } from "@/lib/rate-limit";
import { tenantUploadDirectory } from "@/lib/storage";
import { requireTenantModule } from "@/lib/tenant";

export const complaintStatuses = Object.values(ComplaintStatus);
export const complaintPriorities = Object.values(ComplaintPriority);
export const complaintSeverities = Object.values(ComplaintSeverity);
export const complaintPrivacyModes = Object.values(ComplaintPrivacyMode);

export const complaintAdminRoles = new Set<Role>([Role.ADMIN, Role.SYSTEM_ADMIN, Role.HOA_ADMIN, Role.STAFF]);
const platformRoles = new Set<Role>([Role.SUPER_ADMIN, Role.PLATFORM_ADMIN]);
export const supportedComplaintUploadTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const allowedUploadTypes = new Set<string>(supportedComplaintUploadTypes);
const confidentialComplainantLabel = "Confidential Complainant";
const defaultIdentityRevealRoles = new Set<Role>([Role.ADMIN, Role.HOA_ADMIN, Role.SYSTEM_ADMIN]);

export type ComplaintIntakeState = {
  status: "idle" | "success" | "error";
  message: string;
  complaintId?: string;
  publicReference?: string;
  detailHref?: string;
  trackingCode?: string;
  trackingPin?: string;
};

export type ComplaintTrackState = {
  status: "idle" | "success" | "error";
  message: string;
  complaint?: PublicTrackedComplaint;
};

export type PublicTrackedComplaint = {
  publicReference: string;
  title: string;
  requestedAction: string | null;
  status: ComplaintStatus;
  submittedAt: Date;
  updatedAt: Date;
  messages: Array<{ body: string | null; createdAt: Date; authorDisplayName: string | null }>;
};

export function complaintStatusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function complaintPrivacyLabel(mode: string) {
  return complaintStatusLabel(mode);
}

export function normalizeComplaintText(value: FormDataEntryValue | null, max = 2000) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export async function requireComplaintAdmin() {
  const user = await requireUser(Role.ADMIN);
  const complaintRole = user.roles.find((role) => complaintAdminRoles.has(role));
  if (!complaintRole && user.roles.some((role) => platformRoles.has(role))) throw new Error("Platform roles cannot access tenant complaint content by default.");
  if (!complaintRole) throw new Error("You do not have access to complaint management.");
  await requireTenantModule(user.tenantId, TenantModule.COMPLAINTS);
  return { ...user, role: complaintRole };
}

export async function requireComplaintHomeowner() {
  const user = await requireUser(Role.HOMEOWNER);
  await requireTenantModule(user.tenantId, TenantModule.COMPLAINTS);
  if (!user.homeownerProfile) throw new Error("Homeowner profile not found.");
  return user;
}

export async function ensureComplaintDefaults(tenantId: string) {
  await prisma.complaintSetting.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
  const defaults = [
    ["SECURITY", "Security"],
    ["MAINTENANCE", "Maintenance"],
    ["NOISE", "Noise"],
    ["BILLING", "Billing"],
    ["COMMUNITY_RULES", "Community Rules"],
    ["OTHER", "Other"],
  ];
  for (const [code, name] of defaults) {
    await prisma.complaintCategory.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: {},
      create: { tenantId, code, name, displayOrder: defaults.findIndex(([item]) => item === code) + 1 },
    });
  }
}

export async function getComplaintSettings(tenantId: string) {
  await ensureComplaintDefaults(tenantId);
  return prisma.complaintSetting.findUniqueOrThrow({ where: { tenantId } });
}

export async function canRevealConfidentialIdentity(user: Pick<User, "tenantId" | "role">) {
  if (platformRoles.has(user.role)) return false;
  const settings = await getComplaintSettings(user.tenantId);
  return revealRoleSet(settings.identityRevealRoles).has(user.role);
}

export function allowedComplaintTransitions(status: ComplaintStatus) {
  return complaintTransitionPolicy[status] ?? [];
}

export async function getComplaintCategories(tenantId: string, activeOnly = true) {
  await ensureComplaintDefaults(tenantId);
  return prisma.complaintCategory.findMany({
    where: { tenantId, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
}

export async function submitComplaint(input: {
  user: Awaited<ReturnType<typeof requireUser>>;
  formData: FormData;
  tenantSlug: string;
}): Promise<ComplaintIntakeState> {
  const { user, formData, tenantSlug } = input;
  await requireTenantModule(user.tenantId, TenantModule.COMPLAINTS);
  const settings = await getComplaintSettings(user.tenantId);
  if (!settings.intakeEnabled) throw new Error("Complaint intake is currently disabled.");
  const privacyMode = parseEnum(formData.get("privacyMode"), ComplaintPrivacyMode, ComplaintPrivacyMode.NAMED);
  if (privacyMode === ComplaintPrivacyMode.NAMED && !settings.namedEnabled) throw new Error("Named complaint intake is disabled.");
  if (privacyMode === ComplaintPrivacyMode.CONFIDENTIAL && !settings.confidentialEnabled) throw new Error("Confidential complaint intake is disabled.");
  if (privacyMode === ComplaintPrivacyMode.ANONYMOUS && !settings.anonymousEnabled) throw new Error("Anonymous complaint intake is disabled.");
  if (privacyMode === ComplaintPrivacyMode.ANONYMOUS) {
    const key = `anonymous:${user.tenantId}:${user.id}`;
    if (!await rateLimitAvailable("complaint-anonymous-submit", key, 5, 60 * 60 * 1000)) {
      await recordRateLimitFailure("complaint-anonymous-submit", key);
      throw new Error("Too many anonymous submissions. Please try again later.");
    }
    await recordRateLimitFailure("complaint-anonymous-submit", key);
  }

  const title = normalizeComplaintText(formData.get("title"), 160);
  const description = normalizeComplaintText(formData.get("description"), 4000);
  const requestedAction = normalizeComplaintText(formData.get("requestedAction"), 1000);
  if (title.length < 5) throw new Error("Enter a complaint title.");
  if (description.length < 20) throw new Error("Enter complaint details with at least 20 characters.");
  if (requestedAction.length < 5) throw new Error("Enter the requested action or outcome.");
  const categoryId = normalizeComplaintText(formData.get("categoryId"), 80) || null;
  const category = categoryId ? await prisma.complaintCategory.findFirst({ where: { tenantId: user.tenantId, id: categoryId, active: true }, select: { id: true } }) : null;
  if (categoryId && !category) throw new Error("Select a valid complaint category.");
  const severity = parseEnum(formData.get("severity"), ComplaintSeverity, ComplaintSeverity.MEDIUM);
  const priority = parseEnum(formData.get("priority"), ComplaintPriority, ComplaintPriority.NORMAL);
  const location = normalizeComplaintText(formData.get("location"), 250) || null;
  const incidentDate = parseDate(formData.get("incidentDate"));
  const now = new Date();
  const complaintNumber = await nextComplaintNumber(user.tenantId);
  const publicReference = `CM-${randomToken(10)}`;
  const trackingCode = privacyMode === ComplaintPrivacyMode.ANONYMOUS ? `ANON-${randomToken(12)}` : publicReference;
  const trackingPin = privacyMode === ComplaintPrivacyMode.ANONYMOUS ? randomPin() : undefined;
  const pinHash = trackingPin ? await hash(trackingPin, 12) : null;
  const homeowner = user.homeownerProfile;
  const homeownerIdentity = privacyMode === ComplaintPrivacyMode.CONFIDENTIAL && homeowner
    ? await prisma.homeownerProfile.findFirst({ where: { tenantId: user.tenantId, id: homeowner.id }, select: { phone: true, address: true, block: true, lot: true } })
    : null;
  const file = firstFile(formData.getAll("attachment"));
  const attachment = file ? await stageAttachment(user.tenantId, tenantSlug, file, settings) : null;

  const complaint = await prisma.$transaction(async (tx) => {
    const created = await tx.complaint.create({
      data: {
        tenantId: user.tenantId,
        complaintNumber,
        publicReference,
        privacyMode,
        status: ComplaintStatus.SUBMITTED,
        title,
        categoryId: category?.id ?? null,
        severity,
        priority,
        description,
        requestedAction,
        location,
        incidentDate,
        submittedById: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null,
        homeownerId: privacyMode === ComplaintPrivacyMode.NAMED ? homeowner?.id ?? null : null,
        submittedAt: now,
        dueAt: new Date(now.getTime() + settings.resolutionSlaDays * 24 * 60 * 60 * 1000),
      },
    });
    if (privacyMode === ComplaintPrivacyMode.CONFIDENTIAL) {
      await tx.complaintConfidentialIdentity.create({
        data: {
          tenantId: user.tenantId,
          complaintId: created.id,
          userId: user.id,
          homeownerId: homeowner?.id ?? null,
          displayName: user.name,
          email: user.email,
          phone: homeownerIdentity?.phone ?? null,
          propertyAddress: homeownerIdentity?.address ?? null,
          block: homeownerIdentity?.block ?? null,
          lot: homeownerIdentity?.lot ?? null,
        },
      });
    }
    if (pinHash) await tx.complaintTrackingCredential.create({ data: { tenantId: user.tenantId, complaintId: created.id, trackingCode, pinHash } });
    await tx.complaintMessage.create({ data: { tenantId: user.tenantId, complaintId: created.id, authorId: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null, authorDisplayName: initialComplainantLabel(privacyMode, user.name), body: description, visibility: ComplaintVisibility.PUBLIC } });
    await tx.complaintStatusHistory.create({ data: { tenantId: user.tenantId, complaintId: created.id, toStatus: ComplaintStatus.SUBMITTED, actorId: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null, note: "Complaint submitted." } });
    await tx.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: created.id, actorId: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null, eventType: ComplaintTimelineEventType.SUBMITTED, message: privacyMode === ComplaintPrivacyMode.ANONYMOUS ? "Anonymous complaint submitted." : "Complaint submitted." } });
    if (attachment) {
      await tx.complaintAttachment.create({
        data: {
          tenantId: user.tenantId,
          complaintId: created.id,
          uploaderId: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null,
          originalName: attachment.originalName,
          storedName: attachment.storedName,
          url: attachment.url,
          contentType: attachment.contentType,
          fileSize: attachment.fileSize,
          sha256: attachment.sha256,
          visibility: ComplaintAttachmentVisibility.COMPLAINANT,
          malwareStatus: ComplaintMalwareScanStatus.NOT_CONFIGURED,
          scanNotes: "No malware scanner is configured in this environment.",
        },
      });
      await tx.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: created.id, actorId: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null, eventType: ComplaintTimelineEventType.ATTACHMENT_ADDED, message: "Attachment added.", metadata: { contentType: attachment.contentType, size: attachment.fileSize } } });
    }
    return created;
  });

  await writeAuditLog({ actorId: privacyMode === ComplaintPrivacyMode.ANONYMOUS ? null : user.id, module: "COMPLAINTS", action: "SUBMIT_COMPLAINT", entityType: "Complaint", entityId: complaint.id, metadata: { privacyMode, categoryId: category?.id ?? null, severity, priority } });
  return {
    status: "success",
    message: privacyMode === ComplaintPrivacyMode.ANONYMOUS ? "Anonymous complaint submitted. Keep your tracking code and PIN." : "Complaint submitted successfully.",
    complaintId: complaint.id,
    publicReference: complaint.publicReference,
    detailHref: privacyMode === ComplaintPrivacyMode.ANONYMOUS ? undefined : `/portal/complaints/${complaint.id}`,
    trackingCode: privacyMode === ComplaintPrivacyMode.ANONYMOUS ? trackingCode : undefined,
    trackingPin,
  };
}

export async function getAdminComplaintList(user: Pick<User, "tenantId" | "role">, query: { status?: string; privacy?: string; q?: string }) {
  if (platformRoles.has(user.role)) throw new Error("Platform roles cannot access tenant complaint content by default.");
  const status = Object.values(ComplaintStatus).includes(query.status as ComplaintStatus) ? query.status as ComplaintStatus : undefined;
  const privacyMode = Object.values(ComplaintPrivacyMode).includes(query.privacy as ComplaintPrivacyMode) ? query.privacy as ComplaintPrivacyMode : undefined;
  const q = query.q?.trim() || "";
  return prisma.complaint.findMany({
    where: {
      tenantId: user.tenantId,
      ...(status ? { status } : {}),
      ...(privacyMode ? { privacyMode } : {}),
      ...(q ? { OR: [{ complaintNumber: { contains: q } }, { publicReference: { contains: q } }, { title: { contains: q } }, { location: { contains: q } }] } : {}),
    },
    include: { category: true, assignedTo: { select: { id: true, name: true } }, _count: { select: { messages: true, attachments: true } } },
    orderBy: [{ submittedAt: "desc" }],
    take: 100,
  });
}

export async function getAdminComplaintDetail(user: Pick<User, "tenantId" | "role" | "id">, id: string) {
  if (platformRoles.has(user.role)) throw new Error("Platform roles cannot access tenant complaint content by default.");
  const complaint = await prisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id },
    include: {
      category: true,
      submittedBy: { select: { id: true, name: true } },
      homeowner: { select: { id: true, block: true, lot: true, address: true } },
      assignedTo: { select: { id: true, name: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      messages: { where: { visibility: { not: ComplaintVisibility.CONFIDENTIAL } }, include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } },
      statusHistory: { include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      timelineEvents: { include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
      identityAccess: { include: { requestedBy: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!complaint) return null;
  return maskComplaintForOrdinaryAdmin(complaint);
}

export async function getHomeownerComplaintList(user: Awaited<ReturnType<typeof requireUser>>) {
  return prisma.complaint.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { privacyMode: ComplaintPrivacyMode.NAMED, submittedById: user.id },
        { privacyMode: ComplaintPrivacyMode.NAMED, homeownerId: user.homeownerProfile?.id ?? "" },
        { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { userId: user.id } } },
        { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { homeownerId: user.homeownerProfile?.id ?? "" } } },
      ],
    },
    include: { category: true, _count: { select: { messages: true, attachments: true } } },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });
}

export async function getHomeownerComplaintDetail(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  const complaint = await prisma.complaint.findFirst({
    where: {
      tenantId: user.tenantId,
      id,
      OR: [
        { privacyMode: ComplaintPrivacyMode.NAMED, submittedById: user.id },
        { privacyMode: ComplaintPrivacyMode.NAMED, homeownerId: user.homeownerProfile?.id ?? "" },
        { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { userId: user.id } } },
        { privacyMode: ComplaintPrivacyMode.CONFIDENTIAL, confidentialIdentity: { is: { homeownerId: user.homeownerProfile?.id ?? "" } } },
      ],
    },
    include: { category: true, attachments: { where: { visibility: ComplaintAttachmentVisibility.COMPLAINANT } }, messages: { where: { visibility: ComplaintVisibility.PUBLIC }, orderBy: { createdAt: "asc" } }, statusHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!complaint) return null;
  return maskComplaintForHomeowner(complaint);
}

export async function trackAnonymousComplaint(trackingCode: string, pin: string): Promise<PublicTrackedComplaint> {
  const normalizedCode = trackingCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,40}$/.test(normalizedCode) || !/^\d{6}$/.test(pin.trim())) throw new Error("Enter a valid tracking code and 6-digit PIN.");
  const key = `track:${normalizedCode}`;
  if (!await rateLimitAvailable("complaint-track", key, 8, 15 * 60 * 1000)) throw new Error("Too many attempts. Please try again later.");
  const credential = await platformPrisma.complaintTrackingCredential.findUnique({
    where: { trackingCode: normalizedCode },
    include: { complaint: { include: { messages: { where: { visibility: ComplaintVisibility.PUBLIC }, orderBy: { createdAt: "asc" }, take: 25 } } } },
  });
  if (!credential || credential.disabledAt || !await compare(pin.trim(), credential.pinHash)) {
    await recordRateLimitFailure("complaint-track", key);
    throw new Error("Tracking code or PIN was not found.");
  }
  await platformPrisma.complaintTrackingCredential.update({ where: { id: credential.id }, data: { lastAccessAt: new Date() } });
  return {
    publicReference: credential.complaint.publicReference,
    title: credential.complaint.title,
    requestedAction: credential.complaint.requestedAction,
    status: credential.complaint.status,
    submittedAt: credential.complaint.submittedAt,
    updatedAt: credential.complaint.updatedAt,
    messages: credential.complaint.messages.map((item) => ({ body: item.body, createdAt: item.createdAt, authorDisplayName: item.authorDisplayName })),
  };
}

export async function updateComplaintStatus(user: Awaited<ReturnType<typeof requireComplaintAdmin>>, formData: FormData) {
  const id = normalizeComplaintText(formData.get("id"), 80);
  const nextStatus = parseEnum(formData.get("status"), ComplaintStatus, ComplaintStatus.UNDER_REVIEW);
  const note = normalizeComplaintText(formData.get("note"), 1000) || null;
  const referralDestination = normalizeComplaintText(formData.get("referralDestination"), 160) || null;
  const confirmed = formData.get("confirmTransition") === "on";
  const complaint = await prisma.complaint.findFirst({ where: { tenantId: user.tenantId, id }, select: { id: true, status: true } });
  if (!complaint) throw new Error("Complaint not found.");
  validateComplaintTransition(complaint.status, nextStatus, note, referralDestination, confirmed);
  await prisma.$transaction([
    prisma.complaint.update({
      where: { id: complaint.id },
      data: {
        status: nextStatus,
        acknowledgedAt: nextStatus === ComplaintStatus.ACKNOWLEDGED ? new Date() : undefined,
        resolvedAt: nextStatus === ComplaintStatus.RESOLVED ? new Date() : undefined,
        closedAt: nextStatus === ComplaintStatus.CLOSED ? new Date() : undefined,
        reopenedAt: nextStatus === ComplaintStatus.REOPENED ? new Date() : undefined,
        resolutionSummary: nextStatus === ComplaintStatus.RESOLVED ? note : undefined,
        withdrawalReason: nextStatus === ComplaintStatus.WITHDRAWN ? note : undefined,
      },
    }),
    prisma.complaintStatusHistory.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, fromStatus: complaint.status, toStatus: nextStatus, actorId: user.id, note } }),
    prisma.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: nextStatus === ComplaintStatus.CLOSED ? ComplaintTimelineEventType.CLOSED : nextStatus === ComplaintStatus.REOPENED ? ComplaintTimelineEventType.REOPENED : ComplaintTimelineEventType.STATUS_CHANGED, message: `Status changed to ${complaintStatusLabel(nextStatus)}.`, metadata: safeTransitionMetadata(note, referralDestination) } }),
  ]);
  await writeAuditLog({ actorId: user.id, module: "COMPLAINTS", action: "UPDATE_COMPLAINT_STATUS", entityType: "Complaint", entityId: complaint.id, metadata: { fromStatus: complaint.status, toStatus: nextStatus, hasReason: Boolean(note), hasReferralDestination: Boolean(referralDestination) } });
}

export async function addComplaintMessage(user: Awaited<ReturnType<typeof requireComplaintAdmin>>, formData: FormData) {
  const id = normalizeComplaintText(formData.get("id"), 80);
  const body = normalizeComplaintText(formData.get("message"), 2000);
  const visibility = parseEnum(formData.get("visibility"), ComplaintVisibility, ComplaintVisibility.PUBLIC);
  if (body.length < 2) throw new Error("Enter a message.");
  const complaint = await prisma.complaint.findFirst({ where: { tenantId: user.tenantId, id }, select: { id: true } });
  if (!complaint) throw new Error("Complaint not found.");
  await prisma.$transaction([
    prisma.complaintMessage.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, authorId: user.id, authorDisplayName: user.name, body, visibility } }),
    prisma.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: ComplaintTimelineEventType.COMMENTED, message: visibility === ComplaintVisibility.PUBLIC ? "Public update added." : "Internal note added." } }),
  ]);
}

export async function assignComplaint(user: Awaited<ReturnType<typeof requireComplaintAdmin>>, formData: FormData) {
  const id = normalizeComplaintText(formData.get("id"), 80);
  const assigneeId = normalizeComplaintText(formData.get("assigneeId"), 80);
  const reason = normalizeComplaintText(formData.get("assignmentReason"), 500) || null;
  const assignee = await prisma.user.findFirst({ where: { tenantId: user.tenantId, id: assigneeId, role: { in: Array.from(complaintAdminRoles) }, active: true }, select: { id: true, name: true } });
  if (!assignee) throw new Error("Assignee not found.");
  const complaint = await prisma.complaint.findFirst({ where: { tenantId: user.tenantId, id }, select: { id: true, status: true } });
  if (!complaint) throw new Error("Complaint not found.");
  if (!reason || reason.length < 5) throw new Error("Enter an assignment reason.");
  await prisma.$transaction([
    prisma.complaintAssignment.updateMany({ where: { tenantId: user.tenantId, complaintId: complaint.id, active: true }, data: { active: false, unassignedAt: new Date() } }),
    prisma.complaintAssignment.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, assigneeId: assignee.id, assignedById: user.id, roleLabel: reason } }),
    prisma.complaint.update({ where: { id: complaint.id }, data: { assignedToId: assignee.id, status: complaint.status === ComplaintStatus.SUBMITTED ? ComplaintStatus.ASSIGNED : undefined } }),
    prisma.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: ComplaintTimelineEventType.ASSIGNED, message: `Assigned to ${assignee.name}.`, metadata: { hasReason: true } } }),
  ]);
  await writeAuditLog({ actorId: user.id, module: "COMPLAINTS", action: "ASSIGN_COMPLAINT", entityType: "Complaint", entityId: complaint.id, metadata: { assigneeId: assignee.id, hasReason: true } });
}

export async function requestIdentityAccess(user: Awaited<ReturnType<typeof requireComplaintAdmin>>, formData: FormData) {
  const id = normalizeComplaintText(formData.get("id"), 80);
  const purpose = normalizeComplaintText(formData.get("purpose"), 160);
  const reason = normalizeComplaintText(formData.get("reason"), 1000);
  if (purpose.length < 3 || reason.length < 10) throw new Error("Enter the purpose and reason for identity access.");
  const complaint = await prisma.complaint.findFirst({ where: { tenantId: user.tenantId, id, privacyMode: ComplaintPrivacyMode.CONFIDENTIAL }, select: { id: true } });
  if (!complaint) throw new Error("Confidential complaint not found.");
  await prisma.$transaction([
    prisma.complaintIdentityAccessGrant.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, requestedById: user.id, purpose, reason, status: ComplaintIdentityAccessStatus.REQUESTED } }),
    prisma.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: ComplaintTimelineEventType.IDENTITY_ACCESS_REQUESTED, message: "Confidential identity access requested." } }),
  ]);
  await writeAuditLog({ actorId: user.id, module: "COMPLAINTS", action: "REQUEST_CONFIDENTIAL_IDENTITY_ACCESS", entityType: "Complaint", entityId: complaint.id, metadata: { result: "REQUESTED", hasReason: true } });
}

export async function revealConfidentialIdentity(user: Awaited<ReturnType<typeof requireComplaintAdmin>>, formData: FormData) {
  const id = normalizeComplaintText(formData.get("id"), 80);
  const reason = normalizeComplaintText(formData.get("reason"), 1000);
  const confirmed = formData.get("confirmReveal") === "on" || formData.get("confirmReveal") === "true";
  if (!await canRevealConfidentialIdentity(user)) throw new Error("Confidential identity reveal is not permitted for this role.");
  if (reason.length < 10) throw new Error("Enter a business reason for confidential identity reveal.");
  if (!confirmed) throw new Error("Confirm that the confidential identity reveal is necessary.");
  const complaint = await prisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id, privacyMode: ComplaintPrivacyMode.CONFIDENTIAL },
    select: { id: true, publicReference: true, confidentialIdentity: { select: { displayName: true, email: true, phone: true, propertyAddress: true, block: true, lot: true } } },
  });
  if (!complaint || !complaint.confidentialIdentity) throw new Error("Confidential complaint not found.");
  const now = new Date();
  const grant = await prisma.$transaction(async (tx) => {
    const access = await tx.complaintIdentityAccessGrant.create({
      data: {
        tenantId: user.tenantId,
        complaintId: complaint.id,
        requestedById: user.id,
        approvedById: user.id,
        purpose: "Authorized confidential identity reveal",
        reason,
        status: ComplaintIdentityAccessStatus.APPROVED,
        decidedAt: now,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      },
    });
    await tx.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: ComplaintTimelineEventType.IDENTITY_DISCLOSED, message: "Confidential identity disclosed to an authorized privacy role.", metadata: { accessGrantId: access.id } } });
    return access;
  });
  await writeAuditLog({ actorId: user.id, module: "COMPLAINTS", action: "REVEAL_CONFIDENTIAL_IDENTITY", entityType: "Complaint", entityId: complaint.id, metadata: { publicReference: complaint.publicReference, result: "APPROVED", accessGrantId: grant.id, hasReason: true } });
  return {
    publicReference: complaint.publicReference,
    displayName: complaint.confidentialIdentity.displayName,
    email: complaint.confidentialIdentity.email,
    phone: complaint.confidentialIdentity.phone,
    propertyAddress: complaint.confidentialIdentity.propertyAddress,
    block: complaint.confidentialIdentity.block,
    lot: complaint.confidentialIdentity.lot,
    revealedAt: now.toISOString(),
    expiresAt: grant.expiresAt?.toISOString() ?? null,
  };
}

export async function getComplaintReports(user: Pick<User, "tenantId" | "role">, query: { status?: string; privacy?: string; categoryId?: string; assignedToId?: string; dateFrom?: string; dateTo?: string; page?: string } = {}) {
  if (platformRoles.has(user.role)) throw new Error("Platform roles cannot access tenant complaint content by default.");
  const status = Object.values(ComplaintStatus).includes(query.status as ComplaintStatus) ? query.status as ComplaintStatus : undefined;
  const privacyMode = Object.values(ComplaintPrivacyMode).includes(query.privacy as ComplaintPrivacyMode) ? query.privacy as ComplaintPrivacyMode : undefined;
  const dateFrom = parseDate(query.dateFrom ?? null);
  const dateTo = parseDate(query.dateTo ?? null);
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));
  const take = 25;
  const where = {
    tenantId: user.tenantId,
    ...(status ? { status } : {}),
    ...(privacyMode ? { privacyMode } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
    ...(dateFrom || dateTo ? { submittedAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: new Date(dateTo.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}) } } : {}),
  };
  const [byStatus, byPrivacy, byCategory, byHandler, total, open, filteredTotal, rows] = await Promise.all([
    prisma.complaint.groupBy({ by: ["status"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["privacyMode"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["categoryId"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["assignedToId"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.complaint.count({ where: { tenantId: user.tenantId } }),
    prisma.complaint.count({ where: { tenantId: user.tenantId, status: { notIn: [ComplaintStatus.CLOSED, ComplaintStatus.ARCHIVED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REJECTED] } } }),
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      select: { id: true, complaintNumber: true, publicReference: true, title: true, requestedAction: true, privacyMode: true, status: true, severity: true, priority: true, submittedAt: true, category: { select: { name: true } }, assignedTo: { select: { name: true } } },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
  ]);
  return { total, open, filteredTotal, page, pageSize: take, byStatus, byPrivacy, byCategory, byHandler, rows };
}

const complaintTransitionPolicy: Record<ComplaintStatus, ComplaintStatus[]> = {
  [ComplaintStatus.DRAFT]: [ComplaintStatus.SUBMITTED, ComplaintStatus.WITHDRAWN],
  [ComplaintStatus.SUBMITTED]: [ComplaintStatus.ACKNOWLEDGED, ComplaintStatus.TRIAGED, ComplaintStatus.ASSIGNED, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REFERRED],
  [ComplaintStatus.ACKNOWLEDGED]: [ComplaintStatus.TRIAGED, ComplaintStatus.ASSIGNED, ComplaintStatus.UNDER_REVIEW, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REFERRED],
  [ComplaintStatus.TRIAGED]: [ComplaintStatus.ASSIGNED, ComplaintStatus.UNDER_REVIEW, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REFERRED],
  [ComplaintStatus.ASSIGNED]: [ComplaintStatus.UNDER_REVIEW, ComplaintStatus.WAITING_FOR_INFORMATION, ComplaintStatus.ACTION_IN_PROGRESS, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REFERRED],
  [ComplaintStatus.UNDER_REVIEW]: [ComplaintStatus.WAITING_FOR_INFORMATION, ComplaintStatus.ACTION_IN_PROGRESS, ComplaintStatus.RESOLVED, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REFERRED],
  [ComplaintStatus.WAITING_FOR_INFORMATION]: [ComplaintStatus.UNDER_REVIEW, ComplaintStatus.ACTION_IN_PROGRESS, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN],
  [ComplaintStatus.ACTION_IN_PROGRESS]: [ComplaintStatus.RESOLVED, ComplaintStatus.WAITING_FOR_INFORMATION, ComplaintStatus.REJECTED, ComplaintStatus.REFERRED],
  [ComplaintStatus.RESOLVED]: [ComplaintStatus.CLOSED, ComplaintStatus.REOPENED],
  [ComplaintStatus.CLOSED]: [ComplaintStatus.REOPENED, ComplaintStatus.ARCHIVED],
  [ComplaintStatus.REOPENED]: [ComplaintStatus.ASSIGNED, ComplaintStatus.UNDER_REVIEW, ComplaintStatus.REJECTED, ComplaintStatus.WITHDRAWN],
  [ComplaintStatus.REJECTED]: [ComplaintStatus.REOPENED, ComplaintStatus.ARCHIVED],
  [ComplaintStatus.WITHDRAWN]: [ComplaintStatus.ARCHIVED],
  [ComplaintStatus.REFERRED]: [ComplaintStatus.CLOSED, ComplaintStatus.REOPENED, ComplaintStatus.ARCHIVED],
  [ComplaintStatus.ARCHIVED]: [],
};

function validateComplaintTransition(current: ComplaintStatus, next: ComplaintStatus, note: string | null, referralDestination: string | null, confirmed: boolean) {
  if (current === next) throw new Error("Select a different complaint status.");
  if (!allowedComplaintTransitions(current).includes(next)) throw new Error(`Cannot change status from ${complaintStatusLabel(current)} to ${complaintStatusLabel(next)}.`);
  const needsReason = new Set<ComplaintStatus>([ComplaintStatus.REJECTED, ComplaintStatus.RESOLVED, ComplaintStatus.REOPENED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REFERRED, ComplaintStatus.CLOSED]);
  if (needsReason.has(next) && (!note || note.length < 10)) throw new Error(`${complaintStatusLabel(next)} requires a reason or summary of at least 10 characters.`);
  if (next === ComplaintStatus.WITHDRAWN && !confirmed) throw new Error("Confirm the withdrawal before updating the complaint.");
  if (next === ComplaintStatus.REFERRED && (!referralDestination || referralDestination.length < 3)) throw new Error("Referral requires a destination or office.");
}

function safeTransitionMetadata(note: string | null, referralDestination: string | null) {
  if (!note && !referralDestination) return undefined;
  return { ...(note ? { note } : {}), ...(referralDestination ? { referralDestination } : {}) };
}

function revealRoleSet(value: string | null | undefined) {
  const roles = new Set<Role>();
  for (const item of String(value || "").split(",")) {
    const role = item.trim().toUpperCase();
    if (Object.values(Role).includes(role as Role)) roles.add(role as Role);
  }
  return roles.size ? roles : defaultIdentityRevealRoles;
}

function initialComplainantLabel(privacyMode: ComplaintPrivacyMode, userName: string) {
  if (privacyMode === ComplaintPrivacyMode.ANONYMOUS) return "Anonymous complainant";
  if (privacyMode === ComplaintPrivacyMode.CONFIDENTIAL) return confidentialComplainantLabel;
  return userName;
}

function maskComplaintForOrdinaryAdmin<T extends { privacyMode: ComplaintPrivacyMode; submittedBy?: unknown; homeowner?: unknown; messages: Array<{ authorId: string | null; authorDisplayName: string | null; author?: { role: Role; name: string } | null }> }>(complaint: T) {
  if (complaint.privacyMode !== ComplaintPrivacyMode.CONFIDENTIAL) return complaint;
  return {
    ...complaint,
    submittedBy: null,
    homeowner: null,
    messages: complaint.messages.map((message) => {
      const complainantAuthored = !message.authorId || message.author?.role === Role.HOMEOWNER;
      if (!complainantAuthored) return message;
      return { ...message, author: null, authorDisplayName: confidentialComplainantLabel };
    }),
  };
}

function maskComplaintForHomeowner<T extends { privacyMode: ComplaintPrivacyMode; messages: Array<{ authorId: string | null; authorDisplayName: string | null }> }>(complaint: T) {
  if (complaint.privacyMode !== ComplaintPrivacyMode.CONFIDENTIAL) return complaint;
  return {
    ...complaint,
    messages: complaint.messages.map((message) => !message.authorId ? { ...message, authorDisplayName: confidentialComplainantLabel } : message),
  };
}

async function nextComplaintNumber(tenantId: string) {
  const year = new Date().getFullYear();
  const sequence = await prisma.tenantSequence.upsert({
    where: { tenantId_scope_year: { tenantId, scope: "COMPLAINT", year } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, scope: "COMPLAINT", year, nextValue: 2 },
  });
  return `CM-${year}-${String(sequence.nextValue - 1).padStart(5, "0")}`;
}

async function stageAttachment(tenantId: string, tenantSlug: string, file: File, settings: { maxAttachmentMb: number; allowedMimeTypes: string }) {
  if (!file.size) return null;
  const maxUploadBytes = Math.max(1, Math.min(25, settings.maxAttachmentMb || 10)) * 1024 * 1024;
  const tenantAllowedTypes = new Set(settings.allowedMimeTypes.split(",").map((item) => item.trim()).filter((item) => allowedUploadTypes.has(item)));
  const effectiveAllowedTypes = tenantAllowedTypes.size ? tenantAllowedTypes : allowedUploadTypes;
  if (file.size > maxUploadBytes) throw new Error(`Attachment exceeds the ${Math.round(maxUploadBytes / 1024 / 1024)} MB limit.`);
  if (!effectiveAllowedTypes.has(file.type)) throw new Error("Attachment type is not allowed.");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!validFileSignature(file.type, buffer)) throw new Error("Attachment file signature does not match its type.");
  const folder = new Date().toISOString().slice(0, 7);
  const extension = extensionFor(file.type);
  const storedName = `${randomToken(24)}${extension}`;
  const directory = tenantUploadDirectory(tenantSlug, "complaints", folder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, storedName), buffer, { flag: "wx" });
  return {
    originalName: sanitizeFileName(file.name || "attachment"),
    storedName,
    url: `/uploads/complaints/${tenantSlug}/${folder}/${storedName}`,
    contentType: file.type,
    fileSize: file.size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    tenantId,
  };
}

function firstFile(values: FormDataEntryValue[]) {
  return values.find((item): item is File => typeof item === "object" && "arrayBuffer" in item && "size" in item && item.size > 0);
}

function validFileSignature(contentType: string, buffer: Buffer) {
  if (contentType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (contentType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}

function extensionFor(contentType: string) {
  return { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" }[contentType] ?? "";
}

function sanitizeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160) || "attachment";
}

function parseEnum<T extends Record<string, string>>(value: FormDataEntryValue | null, enumLike: T, fallback: T[keyof T]) {
  const normalized = String(value || "").toUpperCase();
  return Object.values(enumLike).includes(normalized) ? normalized as T[keyof T] : fallback;
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function randomToken(length: number) {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length).toUpperCase();
}

function randomPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
