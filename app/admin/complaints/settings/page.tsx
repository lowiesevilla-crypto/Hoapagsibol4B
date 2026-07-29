import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { getComplaintCategories, getComplaintSettings, normalizeComplaintText, requireComplaintAdmin } from "@/lib/services/complaints";

export default async function ComplaintSettingsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const user = await requireComplaintAdmin();
  const query = await searchParams;
  const [settings, categories] = await Promise.all([getComplaintSettings(user.tenantId), getComplaintCategories(user.tenantId, false)]);
  async function saveSettings(formData: FormData) {
    "use server";
    const admin = await requireComplaintAdmin();
    await prisma.complaintSetting.update({
      where: { tenantId: admin.tenantId },
      data: {
        intakeEnabled: formData.get("intakeEnabled") === "on",
        namedEnabled: formData.get("namedEnabled") === "on",
        confidentialEnabled: formData.get("confidentialEnabled") === "on",
        anonymousEnabled: formData.get("anonymousEnabled") === "on",
        acknowledgementSlaHours: Math.max(1, Math.min(720, Number(formData.get("acknowledgementSlaHours")) || 72)),
        resolutionSlaDays: Math.max(1, Math.min(365, Number(formData.get("resolutionSlaDays")) || 14)),
        updatedById: admin.id,
      },
    });
    revalidatePath("/admin/complaints/settings");
    redirect("/admin/complaints/settings?success=Settings%20saved.");
  }
  async function saveCategory(formData: FormData) {
    "use server";
    const admin = await requireComplaintAdmin();
    const id = normalizeComplaintText(formData.get("id"), 80);
    const name = normalizeComplaintText(formData.get("name"), 120);
    if (!name) redirect("/admin/complaints/settings?error=Category%20name%20is%20required.");
    if (id) {
      await prisma.complaintCategory.update({ where: { id }, data: { name, active: formData.get("active") === "on", requiresBoardReview: formData.get("requiresBoardReview") === "on" } });
    } else {
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
      await prisma.complaintCategory.create({ data: { tenantId: admin.tenantId, code: `${code}-${Date.now().toString(36).toUpperCase()}`, name, active: true, requiresBoardReview: formData.get("requiresBoardReview") === "on" } });
    }
    revalidatePath("/admin/complaints/settings");
    redirect("/admin/complaints/settings?success=Category%20saved.");
  }
  return <>
    <PageHeader eyebrow="Complaint management" title="Complaint Settings" description="Configure tenant complaint intake modes, SLA targets, and categories." />
    {query.success && <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p>}
    {query.error && <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{query.error}</p>}
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form action={saveSettings} className="card space-y-4">
        <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="intakeEnabled" defaultChecked={settings.intakeEnabled} /> Intake enabled</label>
        <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="namedEnabled" defaultChecked={settings.namedEnabled} /> Named complaints</label>
        <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="confidentialEnabled" defaultChecked={settings.confidentialEnabled} /> Confidential complaints</label>
        <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" name="anonymousEnabled" defaultChecked={settings.anonymousEnabled} /> Anonymous complaints</label>
        <label><span className="label">Acknowledgement SLA hours</span><input className="field" type="number" min={1} max={720} name="acknowledgementSlaHours" defaultValue={settings.acknowledgementSlaHours} /></label>
        <label><span className="label">Resolution SLA days</span><input className="field" type="number" min={1} max={365} name="resolutionSlaDays" defaultValue={settings.resolutionSlaDays} /></label>
        <button className="btn-primary w-full">Save settings</button>
      </form>
      <section className="card">
        <h2 className="text-lg font-black">Categories</h2>
        <form action={saveCategory} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><input className="field" name="name" placeholder="New category" required /><button className="btn-secondary">Add category</button></form>
        <div className="mt-5 space-y-2">{categories.map((category) => <form key={category.id} action={saveCategory} className="grid gap-3 rounded-xl bg-slate-50 p-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center"><input type="hidden" name="id" value={category.id} /><input className="field" name="name" defaultValue={category.name} /><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={category.active} /> Active</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="requiresBoardReview" defaultChecked={category.requiresBoardReview} /> Board review</label><button className="btn-secondary min-h-9 px-3 py-1.5 text-xs">Save</button></form>)}</div>
      </section>
    </div>
  </>;
}
