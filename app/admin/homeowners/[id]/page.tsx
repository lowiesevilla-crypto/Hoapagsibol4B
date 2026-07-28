import { notFound } from "next/navigation";
import { NotificationType, Role } from "@prisma/client";
import { FileText } from "lucide-react";
import Link from "next/link";
import { ConfirmSubmitButton, DeleteButton } from "@/components/ui";
import { HomeownerForm } from "@/components/homeowner-form";
import { PageHeader } from "@/components/page-header";
import { saveAdminHouseholdMemberAction } from "@/lib/actions/documents";
import { cancelHomeownerActivationAction, deleteHomeownerAction, disableHomeownerActivationAction, regenerateHomeownerActivationAction, revokeHomeownerDigitalSessionsAction, sendHomeownerActivationInvitationAction, sendHomeownerPasswordResetEmailAction } from "@/lib/actions/homeowners";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { homeownerAccountNumber } from "@/lib/homeowner-account";
import { activationInvitationExpiresAt, deliveryStatusLabel, digitalActivationLabel, homeownerDigitalActivationEligibility, homeownerHasCompletedDigitalActivation, maskAccountNumber, maskEmail, type HomeownerDeliveryStatus } from "@/lib/services/homeowner-digital-activation";
import { canValidateHouseholdMembers, householdMemberEligibility, householdMemberValidationLabel, householdMemberValidationStatus } from "@/lib/services/household-member-eligibility";
import { shortDate } from "@/lib/utils";

export default async function EditHomeownerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  const user = await requireUser(Role.ADMIN);
  const { id } = await params;
  const query = await searchParams;
  const homeowner = await prisma.homeownerProfile.findFirst({ where: { id, tenantId: user.tenantId }, include: { user: true, householdMembers: { orderBy: [{ active: "desc" }, { fullName: "asc" }] } } });
  if (!homeowner) notFound();
  const memberIds = homeowner.householdMembers.map((member) => member.id);
  const validationActorIds = Array.from(new Set(homeowner.householdMembers.flatMap((member) => [member.validatedById, member.revokedById]).filter(Boolean) as string[]));
  const [validationActors, validationAudits] = await Promise.all([
    validationActorIds.length
      ? prisma.user.findMany({ where: { id: { in: validationActorIds }, tenantId: user.tenantId }, select: { id: true, name: true, email: true } })
      : [],
    memberIds.length
      ? prisma.auditLog.findMany({
          where: { tenantId: user.tenantId, entityType: "HouseholdMember", entityId: { in: memberIds }, action: "UPDATE_HOUSEHOLD_MEMBER_VALIDATION" },
          orderBy: { createdAt: "desc" },
          take: memberIds.length * 5,
        })
      : [],
  ]);
  const actorById = new Map(validationActors.map((actor) => [actor.id, actor.name || actor.email]));
  const latestAuditByMemberId = new Map<string, (typeof validationAudits)[number]>();
  for (const audit of validationAudits) if (audit.entityId && !latestAuditByMemberId.has(audit.entityId)) latestAuditByMemberId.set(audit.entityId, audit);
  const canValidate = canValidateHouseholdMembers(user.role);
  const accountNumber = homeownerAccountNumber(homeowner);
  const activationComplete = homeownerHasCompletedDigitalActivation(homeowner);
  const activationEligibility = homeownerDigitalActivationEligibility(homeowner);
  const invitationExpiration = activationInvitationExpiresAt(homeowner);
  const [latestDelivery, latestCredential] = await Promise.all([
    prisma.notificationLog.findFirst({
      where: { tenantId: user.tenantId, recipientId: homeowner.userId, type: NotificationType.WELCOME },
      orderBy: { createdAt: "desc" },
      select: { status: true, createdAt: true, sentAt: true, errorMessage: true },
    }),
    prisma.homeownerActivationCredential.findFirst({
      where: { tenantId: user.tenantId, userId: homeowner.userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, expiresAt: true, usedAt: true, revokedAt: true, attemptCount: true, lastAttemptAt: true },
    }),
  ]);
  return <><PageHeader eyebrow="Homeowners" title={homeowner.user.name} description={`Block ${homeowner.block}, Lot ${homeowner.lot}`} action={<><Link className="btn-secondary" href={`/admin/homeowners/${homeowner.id}/soa`}><FileText className="size-4" /> Statement of Account</Link><form action={deleteHomeownerAction}><input type="hidden" name="id" value={homeowner.id} /><DeleteButton label="Delete profile" /></form></>} />
    {query.error && <Notice kind="error">{query.error}</Notice>}{query.success && <Notice kind="success">{query.message || "Saved."}</Notice>}
    <section className="mb-6 grid gap-3 sm:grid-cols-3">
      <Info label="Masked Homeowner Account Number" value={maskAccountNumber(accountNumber)} mono />
      <Info label="Property" value={`Block ${homeowner.block}, Lot ${homeowner.lot}`} />
      <Info label="Tenant" value={homeowner.tenantId} mono />
      <Info label="Operational Homeowner Status" value={homeowner.status} />
      <Info label="Digital Activation Status" value={digitalActivationLabel(homeowner.activationStatus)} />
      <Info label="Masked Registered Email" value={maskEmail(homeowner.user.email)} />
    </section>
    <section className="card mb-6">
      <h2 className="text-lg font-black">Digital Account Activation</h2>
      <p className="text-sm text-slate-500">Operational homeowner status is separate from digital login activation. HOA staff never set the homeowner permanent password.</p>
      <div className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActivationInfo label="Operational Status" value={homeowner.status} />
        <ActivationInfo label="Digital Activation Status" value={digitalActivationLabel(homeowner.activationStatus)} />
        <ActivationInfo label="Registered Email" value={maskEmail(homeowner.user.email)} />
        <ActivationInfo label="Masked Account Number" value={maskAccountNumber(accountNumber)} mono />
        <ActivationInfo label="Email Verification Status" value={homeowner.emailStatus === "VERIFIED" ? "Verified" : "Unverified"} />
        <ActivationInfo label="Invitation Sent" value={homeowner.activationSentAt ? shortDate(homeowner.activationSentAt) : "Not sent"} />
        <ActivationInfo label="Invitation Expiration" value={invitationExpiration ? shortDate(invitationExpiration) : "Not set"} />
        <ActivationInfo label="Activation Completed" value={homeowner.activatedAt ? shortDate(homeowner.activatedAt) : "Not completed"} />
        <ActivationInfo label="Latest Email Delivery" value={safeDeliveryStatus(latestDelivery)} />
        <ActivationInfo label="Temporary Credential State" value={credentialStateLabel(latestCredential)} />
      </div>
      <p className={`mb-4 rounded-xl p-3 text-sm font-semibold ${activationEligibility.eligible ? "bg-emerald-50 text-emerald-800" : homeowner.user.email.trim() ? "bg-slate-50 text-slate-600" : "bg-amber-50 text-amber-800"}`}>{activationEligibility.reason}</p>
      {latestDelivery?.status === "FAILED" && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">Latest activation email delivery failed. Review Mail Settings or server email logs, then retry.</p>}
      <div className="flex flex-wrap gap-3">
        {!activationComplete && activationEligibility.eligible && !homeowner.activationSentAt && <form action={sendHomeownerActivationInvitationAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-primary" message="Send first-time activation invitation?">Send Activation Invitation</ConfirmSubmitButton></form>}
        {!activationComplete && activationEligibility.eligible && homeowner.activationSentAt && <form action={sendHomeownerActivationInvitationAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-primary" message="Resend activation invitation?">Resend Invitation</ConfirmSubmitButton></form>}
        {!activationComplete && activationEligibility.eligible && <form action={regenerateHomeownerActivationAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-secondary" message="Regenerate the temporary password and email a fresh activation invitation?">Regenerate & Email Activation</ConfirmSubmitButton></form>}
        {!activationComplete && homeowner.activationStatus !== "CANCELLED" && homeowner.activationStatus !== "DISABLED" && <form action={cancelHomeownerActivationAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-secondary" message="Cancel activation and revoke unused temporary credentials?">Cancel Activation</ConfirmSubmitButton></form>}
        {activationComplete && <form action={sendHomeownerPasswordResetEmailAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-secondary" message="Send a password reset email to the registered homeowner email?">Send Password Reset</ConfirmSubmitButton></form>}
        {activationComplete && <form action={revokeHomeownerDigitalSessionsAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-secondary" message="Revoke active sessions for this homeowner?">Revoke Sessions</ConfirmSubmitButton></form>}
        {activationComplete && homeowner.activationStatus !== "DISABLED" && <form action={disableHomeownerActivationAction}><input type="hidden" name="id" value={homeowner.id} /><ConfirmSubmitButton className="btn-danger" message="Disable digital access and revoke active sessions?">Disable Digital Access</ConfirmSubmitButton></form>}
      </div>
      {!activationEligibility.eligible && !activationComplete && <ActionHint>{homeowner.user.email.trim() ? "Resolve the eligibility reason above before sending an activation invitation." : "Activation unavailable. A registered email is required before a first-time invitation can be sent."}</ActionHint>}
      {activationComplete && <ActionHint>This homeowner has completed first-time activation. Use password-reset email or session revocation for account recovery and security support.</ActionHint>}
    </section>
    <HomeownerForm homeowner={homeowner} />
    <section className="card mt-6">
      <h2 className="text-lg font-black">Household and family members</h2>
      <p className="mb-4 text-sm text-slate-500">Admin edits are tenant-scoped. Active status and document-request validation are tracked separately. Existing request and generated-document snapshots are not changed.</p>
      {homeowner.householdMembers.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No household members registered.</p> : <div className="space-y-3">
        {homeowner.householdMembers.map((member) => {
          const validationStatus = householdMemberValidationStatus(member);
          const eligibility = householdMemberEligibility(member, { tenantId: user.tenantId, homeownerId: homeowner.id });
          const audit = latestAuditByMemberId.get(member.id);
          const validationRemarks = audit?.reason || auditMetadataText(audit?.metadata, "remarks") || "";
          const validatedBy = member.validatedById ? actorById.get(member.validatedById) : null;
          const rejectedBy = member.revokedById ? actorById.get(member.revokedById) : null;
          return <form key={member.id} action={saveAdminHouseholdMemberAction} className="grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="homeownerId" value={homeowner.id} />
            <input type="hidden" name="id" value={member.id} />
            <label><span className="label">Full name</span><input className="field" name="fullName" defaultValue={member.fullName} required /></label>
            <label><span className="label">Relationship</span><input className="field" name="relationship" defaultValue={member.relationship} required /></label>
            <label><span className="label">Date of Birth</span><input className="field" name="birthDate" type="date" defaultValue={member.birthDate?.toISOString().slice(0, 10)} /><span className="mt-1 block text-xs text-slate-500">Optional. Used only when required by the selected document type.</span></label>
            <label><span className="label">Civil status</span><input className="field" name="civilStatus" defaultValue={member.civilStatus || ""} /></label>
            <label><span className="label">Nationality</span><input className="field" name="nationality" defaultValue={member.nationality || ""} /></label>
            <label className="xl:col-span-2"><span className="label">Address</span><input className="field" name="address" defaultValue={member.address || ""} /></label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={member.active} /> Active</label>
            <div className="rounded-xl border bg-white p-3 xl:col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="label">Validation Status</span>
                  <p className="text-sm font-black text-slate-900">{householdMemberValidationLabel(validationStatus)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{eligibility.reason}</p>
                </div>
                <span className={`badge ${eligibility.eligible ? "badge-paid" : validationStatus === "REJECTED" ? "badge-overdue" : "badge-info"} w-fit`}>{eligibility.label}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {canValidate ? <label><span className="label">Set validation</span><select className="field" name="validationStatus" defaultValue={validationStatus}><option value="PENDING">Pending</option><option value="VALIDATED">Validated</option><option value="REJECTED">Rejected</option></select></label> : <><input type="hidden" name="validationStatus" value={validationStatus} /><p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">Your role can edit profile details but cannot validate document-request eligibility.</p></>}
                <label className="sm:col-span-2"><span className="label">Validation Remarks</span><textarea className="field min-h-20" name="validationRemarks" defaultValue={validationRemarks} /><span className="mt-1 block text-xs text-slate-500">Required when rejecting. Remarks are recorded in the audit trail.</span></label>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                {member.validatedAt && <p><b>Validated:</b> {shortDate(member.validatedAt)}{validatedBy ? ` by ${validatedBy}` : ""}</p>}
                {member.revokedAt && <p><b>Rejected:</b> {shortDate(member.revokedAt)}{rejectedBy ? ` by ${rejectedBy}` : ""}</p>}
              </div>
            </div>
            <button className="btn-secondary xl:col-span-1">Save member</button>
          </form>;
        })}
      </div>}
    </section>
  </>;
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) { return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>; }

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 break-words font-black text-slate-900 ${mono ? "font-mono text-sm" : ""}`}>{value}</p></div>;
}

function ActivationInfo({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 break-words text-sm font-black text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</p></div>;
}

function ActionHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-800">{children}</p>;
}

function safeDeliveryStatus(delivery: HomeownerDeliveryStatus) {
  if (!delivery) return "No delivery attempt";
  if (delivery.status === "FAILED") return "Failed";
  return deliveryStatusLabel(delivery);
}

function credentialStateLabel(credential: { createdAt: Date; expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; attemptCount: number; lastAttemptAt: Date | null } | null) {
  if (!credential) return "No temporary credential";
  const attempts = credential.attemptCount ? `; ${credential.attemptCount} failed attempt${credential.attemptCount === 1 ? "" : "s"}` : "";
  if (credential.usedAt) return `Used ${shortDate(credential.usedAt)}${attempts}`;
  if (credential.revokedAt) return `Revoked ${shortDate(credential.revokedAt)}${attempts}`;
  if (credential.expiresAt <= new Date()) return `Expired ${shortDate(credential.expiresAt)}${attempts}`;
  return `Active until ${shortDate(credential.expiresAt)}${attempts}`;
}

function auditMetadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
