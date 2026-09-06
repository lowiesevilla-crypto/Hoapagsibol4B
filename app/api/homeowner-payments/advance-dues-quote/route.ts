import { NextResponse } from "next/server";
import { requireHomeownerProfile } from "@/lib/portal";
import { quoteHomeownerAdvanceDues } from "@/lib/services/homeowner-advance-dues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await requireHomeownerProfile();
    const url = new URL(request.url);
    const from = (url.searchParams.get("from") || "").trim();
    const to = (url.searchParams.get("to") || "").trim();
    const quote = await quoteHomeownerAdvanceDues({ tenantId: profile.tenantId, homeownerId: profile.id, from, to });
    return NextResponse.json(quote, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Advance Monthly Dues quote could not be calculated." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
