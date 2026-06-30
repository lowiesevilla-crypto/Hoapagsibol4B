import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string; employee?: string }> }) { const p = await searchParams; redirect(`/admin/payroll?section=adjustments${p.period ? `&period=${p.period}` : ""}${p.employee ? `&employee=${p.employee}` : ""}`); }
