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
const allowedUploadTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxUploadBytes = 10 * 1024 * 1024;

export type ComplaintIntakeState = {
  status: "idle" | "success" | "error";
  message: string;
  complaintId?: string;
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
  if (platformRoles.has(user.role)) throw new Error("Platform roles cannot access tenant complaint content by default.");
  if (!complaintAdminRoles.has(user.role)) throw new Error("You do not have access to complaint management.");
  await requireTenantModule(user.tenantId, TenantModule.COMPLAINTS);
  return user;
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
  if (title.length < 5) throw new Error("Enter a complaint title.");
  if (description.length < 20) throw new Error("Enter complaint details with at least 20 characters.");
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
  const attachment = file ? await stageAttachment(user.tenantId, tenantSlug, file) : null;

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
    await tx.complaintMessage.create({ data: { tenantId: user.tenantId, complaintId: created.id, authorId: privacyMode === ComplaintPrivacyMode.NAMED ? user.id : null, authorDisplayName: privacyMode === ComplaintPrivacyMode.ANONYMOUS ? "Anonymous complainant" : user.name, body: description, visibility: ComplaintVisibility.PUBLIC } });
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
  if (!complaint) throw new Error("Complaint not found.");
  return complaint;
}

export async function getHomeownerComplaintList(user: Awaited<ReturnType<typeof requireUser>>) {
  return prisma.complaint.findMany({
    where: {
      tenantId: user.tenantId,
      OR: [
        { privacyMode: ComplaintPrivacyMode.NAMED, submittedById: user.id },
        { privacyMode: ComplaintPrivacyMode.NAMED, homeownerId: user.homeownerProfile?.id ?? "" },
      ],
    },
    include: { category: true, _count: { select: { messages: true, attachments: true } } },
    orderBy: { submittedAt: "desc" },
    take: 100,
  });
}

export async function getHomeownerComplaintDetail(user: Awaited<ReturnType<typeof requireUser>>, id: string) {
  const complaint = await prisma.complaint.findFirst({
    where: { tenantId: user.tenantId, id, privacyMode: ComplaintPrivacyMode.NAMED, OR: [{ submittedById: user.id }, { homeownerId: user.homeownerProfile?.id ?? "" }] },
    include: { category: true, attachments: true, messages: { where: { visibility: ComplaintVisibility.PUBLIC }, orderBy: { createdAt: "asc" } }, statusHistory: { orderBy: { createdAt: "asc" } } },
  });
  if (!complaint) throw new Error("Complaint not found.");
  return complaint;
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
  const complaint = await prisma.complaint.findFirst({ where: { tenantId: user.tenantId, id }, select: { id: true, status: true } });
  if (!complaint) throw new Error("Complaint not found.");
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
      },
    }),
    prisma.complaintStatusHistory.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, fromStatus: complaint.status, toStatus: nextStatus, actorId: user.id, note } }),
    prisma.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: nextStatus === ComplaintStatus.CLOSED ? ComplaintTimelineEventType.CLOSED : nextStatus === ComplaintStatus.REOPENED ? ComplaintTimelineEventType.REOPENED : ComplaintTimelineEventType.STATUS_CHANGED, message: `Status changed to ${complaintStatusLabel(nextStatus)}.`, metadata: note ? { note } : undefined } }),
  ]);
  await writeAuditLog({ actorId: user.id, module: "COMPLAINTS", action: "UPDATE_COMPLAINT_STATUS", entityType: "Complaint", entityId: complaint.id, metadata: { fromStatus: complaint.status, toStatus: nextStatus } });
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
  const assignee = await prisma.user.findFirst({ where: { tenantId: user.tenantId, id: assigneeId, role: { in: Array.from(complaintAdminRoles) }, active: true }, select: { id: true, name: true } });
  if (!assignee) throw new Error("Assignee not found.");
  const complaint = await prisma.complaint.findFirst({ where: { tenantId: user.tenantId, id }, select: { id: true, status: true } });
  if (!complaint) throw new Error("Complaint not found.");
  await prisma.$transaction([
    prisma.complaintAssignment.updateMany({ where: { tenantId: user.tenantId, complaintId: complaint.id, active: true }, data: { active: false, unassignedAt: new Date() } }),
    prisma.complaintAssignment.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, assigneeId: assignee.id, assignedById: user.id } }),
    prisma.complaint.update({ where: { id: complaint.id }, data: { assignedToId: assignee.id, status: complaint.status === ComplaintStatus.SUBMITTED ? ComplaintStatus.ASSIGNED : undefined } }),
    prisma.complaintTimelineEvent.create({ data: { tenantId: user.tenantId, complaintId: complaint.id, actorId: user.id, eventType: ComplaintTimelineEventType.ASSIGNED, message: `Assigned to ${assignee.name}.` } }),
  ]);
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
}

export async function getComplaintReports(user: Pick<User, "tenantId" | "role">) {
  if (platformRoles.has(user.role)) throw new Error("Platform roles cannot access tenant complaint content by default.");
  const [byStatus, byPrivacy, total, open] = await Promise.all([
    prisma.complaint.groupBy({ by: ["status"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ["privacyMode"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
    prisma.complaint.count({ where: { tenantId: user.tenantId } }),
    prisma.complaint.count({ where: { tenantId: user.tenantId, status: { notIn: [ComplaintStatus.CLOSED, ComplaintStatus.ARCHIVED, ComplaintStatus.WITHDRAWN, ComplaintStatus.REJECTED] } } }),
  ]);
  return { total, open, byStatus, byPrivacy };
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

async function stageAttachment(tenantId: string, tenantSlug: string, file: File) {
  if (!file.size) return null;
  if (file.size > maxUploadBytes) throw new Error("Attachment exceeds the 10 MB limit.");
  if (!allowedUploadTypes.has(file.type)) throw new Error("Attachment type is not allowed.");
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
