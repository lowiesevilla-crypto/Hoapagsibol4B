import Link from "next/link";
import { Role, SystemSettingCategory } from "@prisma/client";
import { Building2, Database, Facebook, KeyRound, Mail, MessageSquare, QrCode } from "lucide-react";
import { GcashQrUpload } from "@/components/gcash-qr-upload";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/ui";
import { saveSystemSettingsAction, sendTestEmailAction } from "@/lib/actions/settings";
import { requireUser } from "@/lib/auth";
import { allSettingFields, getSystemSettingMap, maskedSecret, settingSections } from "@/lib/system-settings";
import { getMailConfiguration } from "@/lib/services/notifications";
import { shortDate } from "@/lib/utils";

const icons = {
  [SystemSettingCategory.ASSOCIATION]: Building2,
  [SystemSettingCategory.DATABASE]: Database,
  [SystemSettingCategory.EMAIL]: Mail,
  [SystemSettingCategory.FACEBOOK]: Facebook,
  [SystemSettingCategory.PAYMENT]: QrCode,
  [SystemSettingCategory.CHAT]: MessageSquare,
};

export default async function SystemSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; message?: string }> }) {
  await requireUser(Role.SYSTEM_ADMIN);
  const [settings, query, mail] = await Promise.all([getSystemSettingMap(), searchParams, getMailConfiguration()]);
  const sourceFor = (category: SystemSettingCategory, key: string) => {
    const saved = settings.get(`${category}.${key}`)?.value?.trim();
    const env = process.env[key]?.trim();
    if (saved) return { source: "Database setting", value: saved };
    if (env) return { source: "Environment variable", value: env };
    return { source: "Not configured", value: "" };
  };
  const setupRows = allSettingFields.map((field) => ({ ...field, ...sourceFor(field.category, field.key) }));
  const endpointRows = [
    ["Public login URL", "https://pagsibol-hoa.tail2abf68.ts.net/login"],
    ["Local login URL", "http://localhost:3000/login"],
    ["System settings", "/admin/settings"],
    ["Homeowner QR payment", "/portal/pay"],
    ["Admin QR review", "/admin/payments"],
    ["GCash webhook endpoint", "/api/payments/webhook/gcash"],
    ["Node environment", process.env.NODE_ENV || "development"],
  ];
  const envStatus = [
    ["DATABASE_URL", Boolean(process.env.DATABASE_URL)],
    ["AUTH_SECRET", Boolean(process.env.AUTH_SECRET)],
    ["APP_URL", Boolean(process.env.APP_URL || process.env.PUBLIC_APP_URL)],
    ["MAIL_USERNAME", Boolean(process.env.MAIL_USERNAME)],
    ["MAIL_PASSWORD", Boolean(process.env.MAIL_PASSWORD)],
    ["FACEBOOK_PAGE_ID", Boolean(process.env.FACEBOOK_PAGE_ID)],
    ["FACEBOOK_PAGE_ACCESS_TOKEN", Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN)],
  ] as const;

  return <>
    <PageHeader eyebrow="System administration" title="Configuration center" description="Manage connection strings, email delivery, Facebook Page tokens, GCash QR payment settings, and association records." action={<Link className="btn-primary" href="/admin/settings/organization">Manage organization</Link>} />
    {query.error && <div role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{query.error}</div>}
    {query.success && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.message || "Configuration updated successfully."}</div>}
    <section className="card mb-6 border-blue-100 bg-blue-50/60">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[.16em] text-blue-800"><KeyRound className="size-4" /> Sensitive settings</p>
          <h2 className="mt-2 text-xl font-black text-ink">System Admin only</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Secret values are not displayed after saving. Leave a secret field blank if you want to keep the current saved value. Database connection changes are stored here for administration, but the running server still needs restart/redeploy before it can use a different database.</p>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:min-w-80">
          {envStatus.map(([name, configured]) => <span key={name} className={`rounded-xl px-3 py-2 font-bold ${configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{name}: {configured ? "configured" : "not in env"}</span>)}
        </div>
      </div>
    </section>

    <section className="card mb-6 border-pine-100 bg-pine-50/40">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><p className="text-xs font-black uppercase tracking-[.16em] text-pine-700">SMTP verification</p><h2 className="mt-1 text-lg font-black">Send test email</h2><p className="mt-1 text-sm leading-6 text-slate-600">Current provider: <b>{mail.provider}</b>. Connection status: <b>{mail.configured ? "ready for testing" : "credentials or sender settings missing"}</b>. Gmail username and App Password remain environment-only.</p></div>
        <form action={sendTestEmailAction} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]"><div><label className="label" htmlFor="test-email">Test recipient</label><input id="test-email" className="field" name="email" type="email" defaultValue={mail.fromAddress} placeholder="admin@example.com" required /></div><div className="sm:self-end"><SubmitButton>Send test email</SubmitButton></div></form>
      </div>
    </section>

    <section className="card mb-6">
      <div className="mb-5"><h2 className="text-lg font-black">Current setup overview</h2><p className="text-sm leading-6 text-slate-500">Read-only snapshot of the effective configuration. Secrets are intentionally masked.</p></div>
      <div className="grid gap-5 xl:grid-cols-[1fr_.75fr]">
        <div className="table-wrap shadow-none"><table className="data-table"><thead><tr><th>Configuration</th><th>Category</th><th>Source</th><th>Current value</th></tr></thead><tbody>{setupRows.map((row) => <tr key={`${row.category}.${row.key}`}><td><p className="font-bold">{row.label}</p><p className="font-mono text-[11px] text-slate-400">{row.key}</p></td><td>{row.category.toLowerCase()}</td><td>{row.source}</td><td className="max-w-sm break-words text-sm">{row.secret ? (row.value ? "Configured - hidden" : "Not configured") : row.value || "Not configured"}</td></tr>)}</tbody></table></div>
        <div className="rounded-3xl border border-pine-100 bg-pine-50/50 p-4">
          <h3 className="font-black text-pine-900">Portal endpoints</h3>
          <dl className="mt-4 space-y-3 text-sm">{endpointRows.map(([label, value]) => <div key={label} className="rounded-2xl bg-white p-3 shadow-sm"><dt className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 break-all font-semibold text-slate-700">{value}</dd></div>)}</dl>
        </div>
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      {settingSections.map((section) => {
        const Icon = icons[section.category];
        return <form action={saveSystemSettingsAction} encType="multipart/form-data" className="card" key={section.category}>
          <input type="hidden" name="category" value={section.category} />
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-pine-50 text-pine-700"><Icon className="size-5" /></span>
            <div>
              <h2 className="text-lg font-black">{section.title}</h2>
              <p className="text-sm leading-6 text-slate-500">{section.description}</p>
            </div>
          </div>
          <div className="grid gap-4">
            {section.fields.map((field) => {
              const item = settings.get(`${section.category}.${field.key}`);
              const saved = item?.value ?? "";
              return <div key={field.key}>
                {field.key === "GCASH_QR_IMAGE_URL" ? <GcashQrUpload currentUrl={saved} /> : <>
                  <label className="label" htmlFor={field.key}>{field.label}</label>
                  {field.multiline ? <textarea id={field.key} className="field min-h-28" name={field.key} defaultValue={saved} placeholder={field.placeholder} /> : <input id={field.key} className="field" name={field.key} type={field.secret ? "password" : "text"} defaultValue={field.secret ? "" : saved} placeholder={field.secret ? maskedSecret(saved) : field.placeholder} autoComplete="off" />}
                  <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>{field.help}</span>{item?.updatedAt && <span>Updated {shortDate(item.updatedAt)}</span>}</div>
                </>}
              </div>;
            })}
          </div>
          <div className="mt-5"><SubmitButton>Save {section.title}</SubmitButton></div>
        </form>;
      })}
    </section>
  </>;
}
