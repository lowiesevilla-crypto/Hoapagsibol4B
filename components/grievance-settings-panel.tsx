import {
  appointGrievanceCommitteeMemberAction,
  endGrievanceCommitteeMembershipAction,
  saveGrievanceSettingAction,
  saveVerificationPolicyAction,
} from "@/lib/actions/grievance";
import { grievancePermissions } from "@/lib/services/grievance-foundation";
import type {
  ComplaintVerificationPolicySummary,
  GrievanceCommitteeMembershipSummary,
  GrievanceSettingSummary,
} from "@/lib/services/grievance-admin";
import { MANILA_TIME_ZONE } from "@/lib/utils";

type CategoryOption = { id: string; name: string };
type UserOption = { id: string; name: string; role: string };

export function GrievanceSettingsPanel({
  settings,
  policies,
  memberships,
  categories,
  users,
}: {
  settings: GrievanceSettingSummary;
  policies: ComplaintVerificationPolicySummary[];
  memberships: GrievanceCommitteeMembershipSummary[];
  categories: CategoryOption[];
  users: UserOption[];
}) {
  return <section className="mt-6 space-y-5" aria-labelledby="grievance-settings-heading">
    <div className="card">
      <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Complaint-to-grievance Phase 1</p>
      <h2 id="grievance-settings-heading" className="mt-1 text-xl font-black">Grievance foundation settings</h2>
      <p className="mt-2 text-sm text-slate-600">Configure anonymous conversation sessions, independent verification policy, and tenant-scoped Grievance Committee appointments. These controls do not create board-vote, hearing, or appeal authority.</p>
    </div>

    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <form action={saveGrievanceSettingAction} className="card space-y-4">
        <h3 className="text-lg font-black">Foundation controls</h3>
        <label className="flex items-start gap-3 text-sm font-bold"><input type="checkbox" name="foundationEnabled" defaultChecked={settings.foundationEnabled} className="mt-1" /><span>Grievance foundation enabled<span className="mt-1 block text-xs font-normal text-slate-500">Disabling this blocks anonymous grievance conversation access but does not delete stored records.</span></span></label>
        <label className="flex items-start gap-3 text-sm font-bold"><input type="checkbox" name="anonymousMessagingEnabled" defaultChecked={settings.anonymousMessagingEnabled} className="mt-1" /><span>Anonymous two-way messaging<span className="mt-1 block text-xs font-normal text-slate-500">Tracking Code + PIN establishes a short-lived session; follow-up messages remain text-only.</span></span></label>
        <label><span className="label">Anonymous session duration (minutes)</span><input className="field" type="number" name="anonymousSessionMinutes" min={5} max={120} defaultValue={settings.anonymousSessionMinutes} /></label>
        <button className="btn-primary w-full">Save grievance settings</button>
      </form>

      <section className="card">
        <h3 className="text-lg font-black">Independent verification policy</h3>
        <p className="mt-1 text-sm text-slate-600">Policies can match category, privacy mode, or both. Verification is not inferred from anonymity alone.</p>
        <form action={saveVerificationPolicyAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label><span className="label">Policy key</span><input className="field uppercase" name="policyKey" required maxLength={120} placeholder="COMMUNITY_RULES_ANON" /></label>
          <label><span className="label">Complaint category</span><select className="field" name="categoryId" defaultValue=""><option value="">Any category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span className="label">Privacy mode</span><select className="field" name="privacyMode" defaultValue=""><option value="">Any privacy mode</option><option value="NAMED">Named</option><option value="CONFIDENTIAL">Confidential</option><option value="ANONYMOUS">Anonymous</option></select></label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="verificationRequired" defaultChecked /> Verification required</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="blocksEnforcement" defaultChecked /> Block enforcement until passed</label>
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked /> Active</label>
          <button className="btn-secondary min-h-11 w-fit md:col-span-2 xl:col-span-3">Save policy</button>
        </form>

        <div className="mt-5 space-y-2">
          {policies.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No verification policies configured. Complaints are not automatically treated as verified merely because no policy exists.</p> : policies.map((policy) => <article key={policy.id} className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black">{policy.policyKey}</p><p className="mt-1 text-slate-600">{policy.categoryName || "Any category"} · {policy.privacyMode ? label(policy.privacyMode) : "Any privacy mode"}</p></div><span className="badge">{Boolean(policy.active) ? "Active" : "Inactive"}</span></div>
            <p className="mt-2 text-xs text-slate-500">Verification: {Boolean(policy.verificationRequired) ? "Required" : "Not required"} · Enforcement gate: {Boolean(policy.blocksEnforcement) ? "Blocked until passed" : "Not blocked"}</p>
            <form action={saveVerificationPolicyAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="policyKey" value={policy.policyKey} />
              <input type="hidden" name="categoryId" value={policy.categoryId || ""} />
              <input type="hidden" name="privacyMode" value={policy.privacyMode || ""} />
              <input type="hidden" name="verificationRequired" value={Boolean(policy.verificationRequired) ? "on" : ""} />
              <input type="hidden" name="blocksEnforcement" value={Boolean(policy.blocksEnforcement) ? "on" : ""} />
              {Boolean(policy.active) ? <button className="btn-secondary min-h-9 px-3 py-1.5 text-xs">Deactivate</button> : <><input type="hidden" name="active" value="on" /><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs">Activate</button></>}
            </form>
          </article>)}
        </div>
      </section>
    </div>

    <section className="card">
      <h3 className="text-lg font-black">Grievance Committee</h3>
      <p className="mt-1 text-sm text-slate-600">Appointments grant only the selected grievance permissions inside this HOA. They do not grant finance, tenant-management, or platform authority.</p>
      <form action={appointGrievanceCommitteeMemberAction} className="mt-4 grid gap-3 lg:grid-cols-4">
        <label><span className="label">Tenant user</span><select className="field" name="userId" required defaultValue=""><option value="" disabled>Choose member</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {label(user.role)}</option>)}</select></label>
        <label><span className="label">Position</span><select className="field" name="position" defaultValue="MEMBER"><option value="CHAIR">Chair</option><option value="MEMBER">Member</option><option value="SECRETARY">Secretary</option><option value="MEDIATOR">Mediator</option></select></label>
        <label><span className="label">Starts (Manila date)</span><input className="field" type="date" name="startsAt" required /></label>
        <label><span className="label">Optional end (Manila date)</span><input className="field" type="date" name="endsAt" /></label>
        <fieldset className="rounded-xl bg-slate-50 p-3 lg:col-span-4"><legend className="label px-1">Scoped permissions</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{grievancePermissions.map((permission) => <label key={permission} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name={`permission:${permission}`} defaultChecked={["VIEW_GRIEVANCE", "TRIAGE_GRIEVANCE"].includes(permission)} /> {label(permission)}</label>)}</div></fieldset>
        <button className="btn-secondary min-h-11 w-fit lg:col-span-4">Appoint committee member</button>
      </form>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {memberships.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 lg:col-span-2">No Grievance Committee appointments recorded.</p> : memberships.map((membership) => <article key={membership.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black text-slate-900">{membership.userName}</p><p className="mt-1 text-slate-600">{label(membership.position)} · starts {formatManila(membership.startsAt)}{membership.endsAt ? ` · ends ${formatManila(membership.endsAt)}` : ""}</p></div><span className="badge">{Boolean(membership.active) ? "Active" : "Ended"}</span></div>
          <p className="mt-2 text-xs text-slate-500">Permissions: {membership.permissions.length ? membership.permissions.map(label).join(", ") : "None"}</p>
          {membership.appointedByName && <p className="mt-1 text-xs text-slate-500">Appointed by {membership.appointedByName}</p>}
          {Boolean(membership.active) && <form action={endGrievanceCommitteeMembershipAction} className="mt-3"><input type="hidden" name="membershipId" value={membership.id} /><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs">End appointment</button></form>}
        </article>)}
      </div>
    </section>
  </section>;
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatManila(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: MANILA_TIME_ZONE, year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}
