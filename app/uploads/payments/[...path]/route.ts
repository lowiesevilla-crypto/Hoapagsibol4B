import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { locateUpload, uploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();
  const { path: segments } = await params;
  if (!segments?.length || segments.some((segment) => segment.includes("..") || segment.includes("/") || segment.includes("\\"))) return new Response("Invalid attachment path.", { status: 400 });
  const baseDirectory = uploadDirectory("payments");
  const filePath = path.resolve(baseDirectory, ...segments);
  if (!filePath.startsWith(baseDirectory + path.sep)) return new Response("Invalid attachment path.", { status: 400 });
  const proofUrl = `/uploads/payments/${segments.join("/")}`;
  if (user.role !== Role.ADMIN && user.role !== Role.SYSTEM_ADMIN) {
    const ownsProof = user.role === Role.HOMEOWNER && Boolean(await prisma.paymentRequest.findFirst({ where: { proofImageUrl: proofUrl, homeowner: { userId: user.id } }, select: { id: true } }))
      || user.role === Role.HOMEOWNER && Boolean(await prisma.payment.findFirst({ where: { proofUrl, status: "ACTIVE", homeowner: { userId: user.id } }, select: { id: true } }));
    if (!ownsProof) return new Response("Not authorized.", { status: 403 });
  }
  try {
    const storedPath = await locateUpload("payments", ...segments);
    const info = await stat(storedPath);
    if (!info.isFile()) return new Response("Attachment not found.", { status: 404 });
    return new Response(await readFile(storedPath), { headers: { "Content-Type": contentTypeFor(storedPath), "Content-Length": String(info.size), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Attachment not found.", { status: 404 });
  }
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" } as Record<string, string>)[extension] ?? "application/octet-stream";
}
