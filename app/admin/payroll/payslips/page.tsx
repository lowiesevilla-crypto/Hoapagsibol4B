import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string }> }) { const p = await searchParams; redirect(`/admin/payroll?section=payslips${p.period ? `&period=${p.period}` : ""}`); }
