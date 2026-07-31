import { NextResponse } from "next/server";
import { revealConfidentialIdentity, requireComplaintAdmin } from "@/lib/services/complaints";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireComplaintAdmin();
    const { id } = await params;
    const formData = await request.formData();
    formData.set("id", id);
    const identity = await revealConfidentialIdentity(user, formData);
    return NextResponse.json({ identity }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Confidential identity could not be revealed." }, { status: 403, headers: { "Cache-Control": "no-store, private" } });
  }
}
