import { setGrievanceOperationalSlaPauseAction } from "@/lib/actions/grievance-sla";
import type { GrievanceCaseSummary } from "@/lib/services/grievance-admin";
import { MANILA_TIME_ZONE } from "@/lib/utils";

export function GrievanceOperationalSlaControl({
  complaintId,
  grievanceCase,
}: {
  complaintId: string;
  grievanceCase: GrievanceCaseSummary | null;
}) {
  if (!grievanceCase) return null;
  const paused = Boolean(grievanceCase.operationalSlaPausedAt);

  return <section className="card" aria-labelledby="grievance-operational-sla-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="grievance-operational-sla-heading" className="text-lg font-black">Operational SLA pause</h3>
        <p className="mt-1 text-sm text-slate-600">Pause the complaint handling SLA only when an approved grievance process wait period is actually running. This does not pause, extend, or rewrite a grievance process deadline.</p>
      </div>
      <span className={`badge ${paused ? "badge-warning" : "badge-success"}`}>{paused ? "Paused" : "Running"}</span>
    </div>

    {paused && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-black">Paused since {formatManila(grievanceCase.operationalSlaPausedAt!)}</p>
      <p className="mt-1 whitespace-pre-wrap">{grievanceCase.operationalSlaPauseReason || "No pause reason recorded."}</p>
    </div>}

    <form action={setGrievanceOperationalSlaPauseAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
      <input type="hidden" name="complaintId" value={complaintId} />
      <input type="hidden" name="grievanceCaseId" value={grievanceCase.id} />
      <input type="hidden" name="slaAction" value={paused ? "resume" : "pause"} />
      <label>
        <span className="label">{paused ? "Resume note" : "Pause reason"}</span>
        <input
          className="field"
          name="reason"
          maxLength={2000}
          required={!paused}
          placeholder={paused ? "Optional note when resuming" : "Approved policy/process reason (required)"}
        />
      </label>
      <button className={paused ? "btn-secondary min-h-11" : "btn-primary min-h-11"}>{paused ? "Resume operational SLA" : "Pause operational SLA"}</button>
    </form>
  </section>;
}

function formatManila(value: Date | string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
