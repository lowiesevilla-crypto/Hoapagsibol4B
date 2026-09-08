import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getHomeownerActivationBulkJobProgress } from "@/lib/services/homeowner-activation-bulk-jobs";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser(Role.ADMIN);
  const { id } = await params;
  const job = await getHomeownerActivationBulkJobProgress(admin.tenantId, id);
  if (!job) return NextResponse.json({ error: "Activation job not found." }, { status: 404 });
  return NextResponse.json({ job });
}
