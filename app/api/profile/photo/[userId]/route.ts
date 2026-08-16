import { readFile } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getHomeownerProfilePhoto } from "@/lib/services/homeowner-profile-photo";
import { tenantUploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const viewer = await requireUser();
  const { userId } = await params;
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: viewer.tenantId, active: true, role: Role.HOMEOWNER },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });

  const photo = await getHomeownerProfilePhoto(viewer.tenantId, target.id);
  if (!photo || !/^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(photo.storedName)) {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }

  try {
    const filePath = path.join(tenantUploadDirectory(viewer.tenant.slug, "profile", target.id), photo.storedName);
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }
}
