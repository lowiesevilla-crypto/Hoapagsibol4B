import Link from "next/link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { saveAdminHouseholdMemberAction } from "@/lib/actions/admin-household-members";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canValidateHouseholdMembers, householdMemberEligibility, householdMemberValidationLabel, householdMemberValidationStatus } from "@/lib/services/household-member-eligibility";
import { shortDate } from "@/lib/utils";

export default async function AdminHouseholdMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string; message?: string }>;
}) {
  const admin = await requireUser(Role.ADMIN);
  const { id: homeownerId } = await params;
  const query = await searchParams;

  const homeowner = await prisma.homeownerProfile.findFirst({
    where: { id: homeownerId, tenantId: admin.tenantId },
    include: {
      user: true,
      householdMembers: { orderBy: [{ active: "desc" }, { fullName: "asc" }] },
    },
  });
  if (!homeowner) notFound();

  const memberIds = homeowner.householdMembers.map((member) => member.id);
  const validationActorIds = Array.from(
    new Set(
      homeowner.householdMembers
        .flatMap((member) => [member.validatedById, member.revokedById])
        .filter(Boolean) as string[],
    ),
  );

  const [validationActors, validationAudits] = await Promise.all([
    validationActorIds.length
      ? prisma.user.findMany({
          where: { id: { in: validationActorIds }, tenantId: admin.tenantId },
          select: { id: true, name: true, email: true },
        })
      : [],
    memberIds.length
      ? prisma.auditLog.findMany({
          where: {
            tenantId: admin.tenantId,
            entityType: "HouseholdMember",
            entityId: { in: memberIds },
            action: "UPDATE_HOUSEHOLD_MEMBER_VALIDATION",
          },
          orderBy: { createdAt: "desc" },
          take: memberIds.length * 5,
        })
      : [],
  ]);

  const actorById = new Map(validationActors.map((actor) => [actor.id, actor.name || actor.email]));
  const latestAuditByMemberId = new Map<string, (typeof validationAudits)[number]>();
  for (const audit of validationAudits) {
    if (audit.entityId && !latestAuditByMemberId.has(audit.entityId)) latestAuditByMemberId.set(audit.entityId, audit);
  }
  const canValidate = canValidateHouseholdMembers(admin.role);

  return (
    <>
      <PageHeader
        eyebrow="Homeowners"
        title="Household Members"
        description={`${homeowner.user.name} · Block ${homeowner.block}, Lot ${homeowner.lot}`}
        action={<Link className="btn-secondary" href={`/admin/homeowners/${homeowner.id}`}>Back to Profile & Access</Link>}
      />

      {query.error ? <Notice kind="error">{query.error}</Notice> : null}
      {query.success ? <Notice kind="success">{query.message || "Saved."}</Notice> : null}

      <section className="card mb-6">
        <div className="mb-4">
          <h2 className="text-lg font-black">Add household member</h2>
          <p className="text-sm text-slate-500">Create a tenant-scoped family or household relationship for this homeowner. New members are active by default.</p>
        </div>
        <form action={saveAdminHouseholdMemberAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="homeownerId" value={homeowner.id} />
          <label><span className="label">Full name</span><input className="field" name="fullName" required minLength={2} /></label>
          <label><span className="label">Relationship</span><input className="field" name="relationship" placeholder="Spouse, child, parent, dependent" required minLength={2} /></label>
          <label><span className="label">Date of Birth</span><input className="field" name="birthDate" type="date" /><span className="mt-1 block text-xs text-slate-500">Optional unless required by a document workflow.</span></label>
          <label><span className="label">Civil status</span><input className="field" name="civilStatus" /></label>
          <label><span className="label">Nationality</span><input className="field" name="nationality" /></label>
          <label className="xl:col-span-2"><span className="label">Address</span><input className="field" name="address" /></label>
          {canValidate ? (
            <label><span className="label">Initial validation</span><select className="field" name="validationStatus" defaultValue="PENDING"><option value="PENDING">Pending</option><option value="VALIDATED">Validated</option><option value="REJECTED">Rejected</option></select></label>
          ) : <input type="hidden" name="validationStatus" value="PENDING" />}
          <label className="md:col-span-2 xl:col-span-4"><span className="label">Validation remarks</span><textarea className="field min-h-20" name="validationRemarks" /><span className="mt-1 block text-xs text-slate-500">Required when rejecting. Validation changes are written to the audit trail.</span></label>
          <div className="md:col-span-2 xl:col-span-4"><button className="btn-primary">Add Household Member</button></div>
        </form>
      </section>

      <section className="card">
        <div className="mb-4">
          <h2 className="text-lg font-black">Registered household members</h2>
          <p className="text-sm text-slate-500">Edit profile details, activate or deactivate a member, and manage document-request validation. Existing issued-document snapshots remain unchanged.</p>
        </div>

        {!homeowner.householdMembers.length ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No household members registered yet. Use the form above to add the first member.</p>
        ) : (
          <div className="space-y-4">
            {homeowner.householdMembers.map((member) => {
              const validationStatus = householdMemberValidationStatus(member);
              const eligibility = householdMemberEligibility(member, { tenantId: admin.tenantId, homeownerId: homeowner.id });
              const audit = latestAuditByMemberId.get(member.id);
              const validationRemarks = audit?.reason || auditMetadataText(audit?.metadata, "remarks") || "";
              const validatedBy = member.validatedById ? actorById.get(member.validatedById) : null;
              const rejectedBy = member.revokedById ? actorById.get(member.revokedById) : null;

              return (
                <form key={member.id} action={saveAdminHouseholdMemberAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-4">
                  <input type="hidden" name="homeownerId" value={homeowner.id} />
                  <input type="hidden" name="id" value={member.id} />
                  <label><span className="label">Full name</span><input className="field" name="fullName" defaultValue={member.fullName} required minLength={2} /></label>
                  <label><span className="label">Relationship</span><input className="field" name="relationship" defaultValue={member.relationship} required minLength={2} /></label>
                  <label><span className="label">Date of Birth</span><input className="field" name="birthDate" type="date" defaultValue={member.birthDate?.toISOString().slice(0, 10)} /></label>
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
                      {canValidate ? (
                        <label><span className="label">Set validation</span><select className="field" name="validationStatus" defaultValue={validationStatus}><option value="PENDING">Pending</option><option value="VALIDATED">Validated</option><option value="REJECTED">Rejected</option></select></label>
                      ) : (
                        <><input type="hidden" name="validationStatus" value={validationStatus} /><p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">Your role can edit profile details but cannot validate document-request eligibility.</p></>
                      )}
                      <label className="sm:col-span-2"><span className="label">Validation Remarks</span><textarea className="field min-h-20" name="validationRemarks" defaultValue={validationRemarks} /><span className="mt-1 block text-xs text-slate-500">Required when rejecting. Remarks are recorded in the audit trail.</span></label>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      {member.validatedAt ? <p><b>Validated:</b> {shortDate(member.validatedAt)}{validatedBy ? ` by ${validatedBy}` : ""}</p> : null}
                      {member.revokedAt ? <p><b>Rejected:</b> {shortDate(member.revokedAt)}{rejectedBy ? ` by ${rejectedBy}` : ""}</p> : null}
                    </div>
                  </div>

                  <div className="xl:col-span-4"><button className="btn-secondary">Save Changes</button></div>
                </form>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>;
}

function auditMetadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
