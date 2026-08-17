import {
  addComplaintSubjectAction,
  createGrievanceDeadlineAction,
  promoteComplaintToGrievanceAction,
  removeComplaintSubjectAction,
  updateComplaintVerificationAction,
  updateGrievanceCaseStatusAction,
  updateGrievanceDeadlineAction,
} from "@/lib/actions/grievance";
import {
  allowedGrievanceTransitions,
  type ComplaintGrievanceFoundation,
} from "@/lib/services/grievance-admin";
import { MANILA_TIME_ZONE } from "@/lib/utils";

type HomeownerOption = {
  id: string;
  name: string;
  phase: string | null;
  block: string;
  lot: string;
};

type VehicleOption = {
  id: string;
  plateNumber: string;
  homeownerName: string;
  block: string;
  lot: string;
};

const verificationMethods = [
  "SITE_INSPECTION",
  "SECURITY_REPORT",
  "CCTV_REVIEW",
  "STAFF_OBSERVATION",
  "DOCUMENT_REVIEW",
  "MULTIPLE_INDEPENDENT_REPORTS",
  "OTHER",
] as const;

const deadlineTypes = [
  "RESPONDENT_RESPONSE",
  "MEDIATION_SCHEDULING",
  "HEARING_NOTICE",
  "RECONSIDERATION",
  "APPEAL",
  "CORRECTIVE_ACTION",
] as const;

export function GrievanceFoundationPanel({
  complaintId,
  foundation,
  homeowners,
  vehicles,
}: {
  complaintId: string;
  foundation: ComplaintGrievanceFoundation;
  homeowners: HomeownerOption[];
  vehicles: VehicleOption[];
}) {
  const grievance = foundation.grievanceCase;
  const nextStatuses = grievance ? allowedGrievanceTransitions(grievance.status) : [];
  const verification = foundation.verification;
  const enforcementBlocked = Boolean(verification?.required) && Boolean(verification?.blocksEnforcement) && verification?.status !== "PASSED";

  return <section className="space-y-5" aria-labelledby="grievance-foundation-heading">
    <div className="card">
      <p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">Phase 1 grievance foundation</p>
      <h2 id="grievance-foundation-heading" className="mt-1 text-xl font-black text-slate-950">Subject, verification and formal grievance</h2>
      <p className="mt-2 text-sm text-slate-600">The complaint remains the intake/operational case. Formal grievance state, independent verification, and process deadlines are tracked separately.</p>
    </div>

    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Complaint subjects</h3>
          <p className="mt-1 text-sm text-slate-600">Subject property/person is separate from the incident location recorded on the complaint.</p>
        </div>
        <span className="badge">{foundation.subjects.length} subject{foundation.subjects.length === 1 ? "" : "s"}</span>
      </div>

      {foundation.subjects.length > 0 && <div className="mt-4 space-y-2">
        {foundation.subjects.map((subject) => <article key={subject.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-black text-slate-900">{label(subject.subjectType)}{subject.displayLabel ? ` · ${subject.displayLabel}` : ""}</p>
            <p className="mt-1 text-slate-600">{propertyLabel(subject.phaseSnapshot, subject.blockSnapshot, subject.lotSnapshot) || "No structured property snapshot"}</p>
            {subject.addressSnapshot && <p className="mt-1 break-words text-xs text-slate-500">Admin record: {subject.addressSnapshot}</p>}
          </div>
          <form action={removeComplaintSubjectAction}>
            <input type="hidden" name="complaintId" value={complaintId} />
            <input type="hidden" name="subjectId" value={subject.id} />
            <button className="btn-secondary min-h-10 px-3 py-1.5 text-xs">Remove</button>
          </form>
        </article>)}
      </div>}

      <form action={addComplaintSubjectAction} className="mt-5 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="complaintId" value={complaintId} />
        <label><span className="label">Subject type</span><select className="field" name="subjectType" defaultValue="PROPERTY" required>
          <option value="HOMEOWNER">Homeowner</option>
          <option value="PROPERTY">Property</option>
          <option value="VEHICLE">Vehicle</option>
          <option value="COMMON_AREA">Common area</option>
          <option value="UNKNOWN">Unknown</option>
        </select></label>
        <label><span className="label">Display label / common area</span><input className="field" name="displayLabel" maxLength={191} placeholder="Optional short label" /></label>
        <label><span className="label">Known homeowner/property</span><select className="field" name="homeownerId" defaultValue="">
          <option value="">Not linked</option>
          {homeowners.map((item) => <option key={item.id} value={item.id}>{item.name} · {propertyLabel(item.phase, item.block, item.lot)}</option>)}
        </select></label>
        <label><span className="label">Known vehicle</span><select className="field" name="vehicleId" defaultValue="">
          <option value="">Not linked</option>
          {vehicles.map((item) => <option key={item.id} value={item.id}>{item.plateNumber} · {item.homeownerName} · Block {item.block} Lot {item.lot}</option>)}
        </select></label>
        <p className="text-xs text-slate-500 md:col-span-2">For Homeowner/Property choose a same-HOA property. For Vehicle choose a same-HOA vehicle. No resident email or phone is exposed by this selector.</p>
        <button className="btn-secondary min-h-11 w-fit md:col-span-2">Add subject</button>
      </form>
    </section>

    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Independent verification</h3>
          <p className="mt-1 text-sm text-slate-600">Verification is determined by tenant policy, not by complaint privacy mode alone.</p>
        </div>
        <span className={`badge ${verification?.status === "PASSED" ? "badge-success" : enforcementBlocked ? "badge-danger" : "badge-info"}`}>{verification ? label(verification.status) : "Not evaluated"}</span>
      </div>

      {verification ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Required" value={Boolean(verification.required) ? "Yes" : "No"} />
        <Info label="Blocks enforcement" value={Boolean(verification.blocksEnforcement) ? "Yes" : "No"} />
        <Info label="Method" value={verification.verificationType ? label(verification.verificationType) : "Not recorded"} />
        <Info label="Verified by" value={verification.verifiedByName || "Not completed"} />
      </div> : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">The policy will be evaluated when verification work starts or when this complaint is promoted to a formal grievance.</p>}

      {enforcementBlocked && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
        <p className="font-black">Formal enforcement gate is blocked</p>
        <p className="mt-1">This case cannot advance to <b>Ready for Formal Process</b> until independent verification is marked Passed.</p>
      </div>}
      {verification?.findings && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><p className="font-black">Findings</p><p className="mt-1 whitespace-pre-wrap text-slate-700">{verification.findings}</p></div>}

      <form action={updateComplaintVerificationAction} className="mt-5 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="complaintId" value={complaintId} />
        <label><span className="label">Verification status</span><select className="field" name="verificationStatus" defaultValue="IN_PROGRESS" required>
          <option value="IN_PROGRESS">In progress</option>
          <option value="PASSED">Passed / substantiated</option>
          <option value="FAILED">Failed / not substantiated</option>
          <option value="INSUFFICIENT">Insufficient evidence</option>
        </select></label>
        <label><span className="label">Verification method</span><select className="field" name="verificationType" defaultValue={verification?.verificationType || ""}>
          <option value="">Choose method</option>
          {verificationMethods.map((method) => <option key={method} value={method}>{label(method)}</option>)}
        </select></label>
        <label className="md:col-span-2"><span className="label">Verification findings</span><textarea className="field min-h-24" name="findings" defaultValue={verification?.findings || ""} placeholder="Record independent findings. Completed results require findings." /></label>
        <button className="btn-secondary min-h-11 w-fit md:col-span-2">Save verification</button>
      </form>
    </section>

    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Formal grievance case</h3>
          <p className="mt-1 text-sm text-slate-600">Promotion is explicit and does not replace the complaint operational status history.</p>
        </div>
        <span className="badge badge-info">{grievance ? label(grievance.status) : "Not initiated"}</span>
      </div>

      {!grievance ? <form action={promoteComplaintToGrievanceAction} className="mt-4">
        <input type="hidden" name="complaintId" value={complaintId} />
        <button className="btn-primary min-h-11">Promote to formal grievance</button>
      </form> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="Grievance status" value={label(grievance.status)} />
          <Info label="Board review policy" value={Boolean(grievance.boardReviewRequired) ? "Required by category policy" : "Not flagged"} />
          <Info label="Operational SLA" value={grievance.operationalSlaPausedAt ? `Paused · ${formatManila(grievance.operationalSlaPausedAt)}` : "Running / unchanged"} />
          <Info label="Created" value={formatManila(grievance.createdAt)} />
        </div>
        {Boolean(grievance.boardReviewRequired) && <p className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><b>Board review policy flag only.</b> This does not mean a board vote, quorum check, recusal process, or approval has occurred.</p>}
        <form action={updateGrievanceCaseStatusAction} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <input type="hidden" name="complaintId" value={complaintId} />
          <input type="hidden" name="grievanceCaseId" value={grievance.id} />
          <label><span className="label">Next grievance status</span><select className="field" name="grievanceStatus" defaultValue="" required>
            <option value="" disabled>Choose transition</option>
            {nextStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select></label>
          <label><span className="label">Reason / note</span><input className="field" name="note" maxLength={4000} placeholder="Required for closure" /></label>
          <button className="btn-secondary min-h-11" disabled={nextStatuses.length === 0}>Update grievance</button>
        </form>
      </>}
    </section>

    {grievance && <section className="card">
      <h3 className="text-lg font-black">Process deadlines</h3>
      <p className="mt-1 text-sm text-slate-600">These deadlines are separate from the complaint operational SLA. Dates are entered and displayed in Asia/Manila.</p>
      <form action={createGrievanceDeadlineAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="complaintId" value={complaintId} />
        <input type="hidden" name="grievanceCaseId" value={grievance.id} />
        <label><span className="label">Deadline type</span><select className="field" name="deadlineType" required>{deadlineTypes.map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
        <label><span className="label">Starts (Manila date)</span><input className="field" type="date" name="startsAt" required /></label>
        <label><span className="label">Due (Manila date)</span><input className="field" type="date" name="dueAt" required /></label>
        <label><span className="label">Policy source</span><input className="field" name="policySource" placeholder="Bylaw/policy reference" /></label>
        <button className="btn-secondary min-h-11 w-fit xl:col-span-4">Create deadline</button>
      </form>

      <div className="mt-5 space-y-3">
        {foundation.deadlines.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No process deadlines recorded.</p> : foundation.deadlines.map((deadline) => <article key={deadline.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-black text-slate-900">{label(deadline.deadlineType)}</p><p className="mt-1 text-sm text-slate-600">{formatManila(deadline.startsAt)} → {formatManila(deadline.dueAt)}</p></div>
            <span className="badge">{label(deadline.status)}</span>
          </div>
          {deadline.policySource && <p className="mt-2 text-xs text-slate-500">Policy: {deadline.policySource}</p>}
          {deadline.pauseReason && <p className="mt-2 text-xs text-amber-800">Pause reason: {deadline.pauseReason}</p>}
          <form action={updateGrievanceDeadlineAction} className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr_auto] sm:items-end">
            <input type="hidden" name="complaintId" value={complaintId} />
            <input type="hidden" name="grievanceCaseId" value={grievance.id} />
            <input type="hidden" name="deadlineId" value={deadline.id} />
            <label><span className="label">Deadline status</span><select className="field" name="deadlineStatus" defaultValue={deadline.status}>
              <option value="OPEN">Open / resume</option><option value="PAUSED">Paused</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
            </select></label>
            <label><span className="label">Pause reason</span><input className="field" name="reason" placeholder="Required when pausing" /></label>
            <button className="btn-secondary min-h-11">Update</button>
          </form>
        </article>)}
      </div>
    </section>}

    {foundation.activities.length > 0 && <section className="card">
      <h3 className="text-lg font-black">Grievance activity</h3>
      <div className="mt-4 space-y-2">{foundation.activities.map((activity) => <div key={activity.id} className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-black text-slate-800">{label(activity.eventType)}</p>
        <p className="mt-1 text-slate-600">{activity.message}</p>
        <p className="mt-1 text-xs text-slate-500">{formatManila(activity.createdAt)} · {activity.actorName || "System / anonymous"}</p>
      </div>)}</div>
    </section>}
  </section>;
}

function Info({ label: title, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="block text-xs font-bold uppercase tracking-wide text-slate-500">{title}</span><span className="mt-1 block font-black text-slate-900">{value}</span></div>;
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function propertyLabel(phase: string | null, block: string | null, lot: string | null) {
  return [phase ? `Phase ${phase}` : "", block ? `Block ${block}` : "", lot ? `Lot ${lot}` : ""].filter(Boolean).join(" · ");
}

function formatManila(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
