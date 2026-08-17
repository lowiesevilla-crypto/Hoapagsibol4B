"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ComplaintPrivacyMode } from "@prisma/client";
import {
  removeComplaintSubject,
  saveGrievanceSetting,
  updateGrievanceCaseStatus,
  updateGrievanceDeadlineStatus,
  type GrievanceCaseStatus,
  type GrievanceDeadlineStatus,
} from "@/lib/services/grievance-admin";
import {
  assertCommitteeAppointmentTargetEligible,
  assertGrievanceActorEligible,
  assertGrievanceAdminAuthority,
} from "@/lib/services/grievance-authorization";
import {
  addComplaintSubject,
  appointGrievanceCommitteeMember,
  createGrievanceDeadline,
  endGrievanceCommitteeMembership,
  grievancePermissions,
  promoteComplaintToGrievance,
  recordComplaintVerification,
  upsertComplaintVerificationPolicy,
  type ComplaintSubjectType,
  type ComplaintVerificationStatus,
  type ComplaintVerificationType,
  type GrievanceCommitteePosition,
  type GrievanceDeadlineType,
  type GrievancePermission,
} from "@/lib/services/grievance-foundation";
import { requireComplaintAdmin } from "@/lib/services/complaints";

const subjectTypes = new Set<ComplaintSubjectType>(["HOMEOWNER", "PROPERTY", "VEHICLE", "COMMON_AREA", "UNKNOWN"]);
const verificationStatuses = new Set<ComplaintVerificationStatus>(["IN_PROGRESS", "PASSED", "FAILED", "INSUFFICIENT"]);
const verificationTypes = new Set<ComplaintVerificationType>(["SITE_INSPECTION", "SECURITY_REPORT", "CCTV_REVIEW", "STAFF_OBSERVATION", "DOCUMENT_REVIEW", "MULTIPLE_INDEPENDENT_REPORTS", "OTHER"]);
const committeePositions = new Set<GrievanceCommitteePosition>(["CHAIR", "MEMBER", "SECRETARY", "MEDIATOR"]);
const deadlineTypes = new Set<GrievanceDeadlineType>(["RESPONDENT_RESPONSE", "MEDIATION_SCHEDULING", "HEARING_NOTICE", "RECONSIDERATION", "APPEAL", "CORRECTIVE_ACTION"]);
const grievanceStatuses = new Set<GrievanceCaseStatus>(["ASSESSMENT", "VERIFICATION_REQUIRED", "VERIFIED", "READY_FOR_FORMAL_PROCESS", "CLOSED_NO_ACTION", "CLOSED_UNSUBSTANTIATED"]);
const deadlineStatuses = new Set<GrievanceDeadlineStatus>(["OPEN", "PAUSED", "COMPLETED", "CANCELLED"]);
const privacyModes = new Set<ComplaintPrivacyMode>(Object.values(ComplaintPrivacyMode));
const permissionSet = new Set<GrievancePermission>(grievancePermissions);

function text(formData: FormData, key: string, max = 4000) {
  return String(formData.get(key) || "").trim().slice(0, max);
}

function optionalText(formData: FormData, key: string, max = 4000) {
  return text(formData, key, max) || null;
}

function parseManilaDate(value: FormDataEntryValue | null, label: string) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} is required.`);
  const parsed = new Date(`${raw}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
  return parsed;
}

function complaintRedirect(id: string, kind: "success" | "error", message: string): never {
  redirect(`/admin/complaints/${encodeURIComponent(id)}?${kind}=${encodeURIComponent(message)}`);
}

function settingsRedirect(kind: "success" | "error", message: string): never {
  redirect(`/admin/complaints/settings?${kind}=${encodeURIComponent(message)}`);
}

export async function addComplaintSubjectAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    const subjectType = text(formData, "subjectType", 40) as ComplaintSubjectType;
    if (!subjectTypes.has(subjectType)) throw new Error("Choose a valid complaint subject type.");
    await addComplaintSubject(user, {
      complaintId,
      subjectType,
      homeownerId: optionalText(formData, "homeownerId", 191),
      vehicleId: optionalText(formData, "vehicleId", 191),
      displayLabel: optionalText(formData, "displayLabel", 191),
    });
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Complaint subject could not be added.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Complaint subject added.");
}

export async function removeComplaintSubjectAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    await removeComplaintSubject(user, complaintId, text(formData, "subjectId", 191));
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Complaint subject could not be removed.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Complaint subject removed.");
}

export async function promoteComplaintToGrievanceAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    await promoteComplaintToGrievance(user, complaintId);
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Grievance case could not be created.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Formal grievance case created.");
}

export async function updateComplaintVerificationAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    const status = text(formData, "verificationStatus", 40) as ComplaintVerificationStatus;
    const methodRaw = text(formData, "verificationType", 60);
    const verificationType = methodRaw ? methodRaw as ComplaintVerificationType : null;
    if (!verificationStatuses.has(status)) throw new Error("Choose a valid verification status.");
    if (verificationType && !verificationTypes.has(verificationType)) throw new Error("Choose a valid verification method.");
    await recordComplaintVerification(user, {
      complaintId,
      status,
      verificationType,
      findings: optionalText(formData, "findings", 8000),
    });
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Verification could not be updated.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Verification record updated.");
}

export async function updateGrievanceCaseStatusAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    const status = text(formData, "grievanceStatus", 60) as GrievanceCaseStatus;
    if (!grievanceStatuses.has(status)) throw new Error("Choose a valid grievance status.");
    await updateGrievanceCaseStatus(user, {
      complaintId,
      grievanceCaseId: text(formData, "grievanceCaseId", 191),
      status,
      note: text(formData, "note", 4000),
    });
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Grievance status could not be updated.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Grievance status updated.");
}

export async function createGrievanceDeadlineAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    const deadlineType = text(formData, "deadlineType", 60) as GrievanceDeadlineType;
    if (!deadlineTypes.has(deadlineType)) throw new Error("Choose a valid process deadline type.");
    await createGrievanceDeadline(user, {
      grievanceCaseId: text(formData, "grievanceCaseId", 191),
      deadlineType,
      startsAt: parseManilaDate(formData.get("startsAt"), "Start date"),
      dueAt: parseManilaDate(formData.get("dueAt"), "Due date"),
      policySource: optionalText(formData, "policySource", 4000),
    });
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Process deadline could not be created.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Process deadline created.");
}

export async function updateGrievanceDeadlineAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  const complaintId = text(formData, "complaintId", 191);
  try {
    assertGrievanceActorEligible(user);
    const status = text(formData, "deadlineStatus", 30) as GrievanceDeadlineStatus;
    if (!deadlineStatuses.has(status)) throw new Error("Choose a valid process deadline status.");
    await updateGrievanceDeadlineStatus(user, {
      complaintId,
      grievanceCaseId: text(formData, "grievanceCaseId", 191),
      deadlineId: text(formData, "deadlineId", 191),
      status,
      reason: optionalText(formData, "reason", 2000),
    });
  } catch (error) {
    complaintRedirect(complaintId, "error", error instanceof Error ? error.message : "Process deadline could not be updated.");
  }
  revalidatePath(`/admin/complaints/${complaintId}`);
  complaintRedirect(complaintId, "success", "Process deadline updated.");
}

export async function saveGrievanceSettingAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  try {
    assertGrievanceAdminAuthority(user);
    await saveGrievanceSetting(user, {
      foundationEnabled: formData.get("foundationEnabled") === "on",
      anonymousMessagingEnabled: formData.get("anonymousMessagingEnabled") === "on",
      anonymousSessionMinutes: Number(formData.get("anonymousSessionMinutes")) || 30,
    });
  } catch (error) {
    settingsRedirect("error", error instanceof Error ? error.message : "Grievance settings could not be saved.");
  }
  revalidatePath("/admin/complaints/settings");
  settingsRedirect("success", "Grievance settings saved.");
}

export async function saveVerificationPolicyAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  try {
    assertGrievanceAdminAuthority(user);
    const privacyRaw = text(formData, "privacyMode", 30);
    const privacyMode = privacyRaw ? privacyRaw as ComplaintPrivacyMode : null;
    if (privacyMode && !privacyModes.has(privacyMode)) throw new Error("Choose a valid privacy mode.");
    await upsertComplaintVerificationPolicy(user, {
      policyKey: text(formData, "policyKey", 120),
      categoryId: optionalText(formData, "categoryId", 191),
      privacyMode,
      verificationRequired: formData.get("verificationRequired") === "on",
      blocksEnforcement: formData.get("blocksEnforcement") === "on",
      active: formData.get("active") === "on",
    });
  } catch (error) {
    settingsRedirect("error", error instanceof Error ? error.message : "Verification policy could not be saved.");
  }
  revalidatePath("/admin/complaints/settings");
  settingsRedirect("success", "Verification policy saved.");
}

export async function appointGrievanceCommitteeMemberAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  try {
    assertGrievanceAdminAuthority(user);
    const targetUserId = text(formData, "userId", 191);
    await assertCommitteeAppointmentTargetEligible(user.tenantId, targetUserId);
    const position = text(formData, "position", 30) as GrievanceCommitteePosition;
    if (!committeePositions.has(position)) throw new Error("Choose a valid committee position.");
    const permissions = grievancePermissions.filter((permission) => formData.get(`permission:${permission}`) === "on");
    if (!permissions.every((permission) => permissionSet.has(permission))) throw new Error("Committee permission selection is invalid.");
    await appointGrievanceCommitteeMember(user, {
      userId: targetUserId,
      position,
      permissions,
      startsAt: parseManilaDate(formData.get("startsAt"), "Appointment start date"),
      endsAt: formData.get("endsAt") ? parseManilaDate(formData.get("endsAt"), "Appointment end date") : null,
    });
  } catch (error) {
    settingsRedirect("error", error instanceof Error ? error.message : "Committee appointment could not be saved.");
  }
  revalidatePath("/admin/complaints/settings");
  settingsRedirect("success", "Grievance Committee appointment saved.");
}

export async function endGrievanceCommitteeMembershipAction(formData: FormData) {
  const user = await requireComplaintAdmin();
  try {
    assertGrievanceAdminAuthority(user);
    await endGrievanceCommitteeMembership(user, text(formData, "membershipId", 191));
  } catch (error) {
    settingsRedirect("error", error instanceof Error ? error.message : "Committee appointment could not be ended.");
  }
  revalidatePath("/admin/complaints/settings");
  settingsRedirect("success", "Grievance Committee appointment ended.");
}
