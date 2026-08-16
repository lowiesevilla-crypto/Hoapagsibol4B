import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  deleteHomeownerProfilePhoto,
  getHomeownerProfilePhoto,
  saveHomeownerProfilePhoto,
} from "@/lib/services/homeowner-profile-photo";
import { tenantUploadDirectory } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET() {
  const user = await requireUser(Role.HOMEOWNER);
  const photo = await getHomeownerProfilePhoto(user.tenantId, user.id);
  if (!photo || !isSafeStoredName(photo.storedName)) {
    return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  }

  try {
    const filePath = path.join(profilePhotoDirectory(user.tenant.slug, user.id), photo.storedName);
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

export async function POST(request: Request) {
  const user = await requireUser(Role.HOMEOWNER);
  const formData = await request.formData();
  const item = formData.get("file");
  if (!(item instanceof File) || item.size <= 0) {
    return NextResponse.json({ error: "Choose a profile photo." }, { status: 400 });
  }
  if (!allowedTypes.has(item.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
  }
  if (item.size > MAX_PROFILE_PHOTO_BYTES) {
    return NextResponse.json({ error: "Profile photos must be 5MB or smaller." }, { status: 400 });
  }

  const bytes = Buffer.from(await item.arrayBuffer());
  if (!matchesImageSignature(bytes, item.type)) {
    return NextResponse.json({ error: "The selected file is not a valid image." }, { status: 400 });
  }

  const previous = await getHomeownerProfilePhoto(user.tenantId, user.id);
  const storedName = `${randomUUID()}${extensionFor(item.type)}`;
  const directory = profilePhotoDirectory(user.tenant.slug, user.id);
  const newPath = path.join(directory, storedName);
  await mkdir(directory, { recursive: true });
  await writeFile(newPath, bytes, { flag: "wx" });

  let saved;
  try {
    saved = await saveHomeownerProfilePhoto({
      tenantId: user.tenantId,
      userId: user.id,
      storedName,
      contentType: item.type,
      size: bytes.length,
    });
  } catch (error) {
    await unlink(newPath).catch(() => undefined);
    throw error;
  }

  if (previous?.storedName && previous.storedName !== storedName && isSafeStoredName(previous.storedName)) {
    await unlink(path.join(directory, previous.storedName)).catch(() => undefined);
  }

  await writeAuditLog({
    actorId: user.id,
    module: "HOMEOWNER_PROFILE",
    action: "UPLOAD_PROFILE_PHOTO",
    entityType: "User",
    entityId: user.id,
    metadata: { contentType: item.type, size: bytes.length },
  });

  return NextResponse.json({ ok: true, version: saved?.updatedAt.toISOString() ?? new Date().toISOString() });
}

export async function DELETE() {
  const user = await requireUser(Role.HOMEOWNER);
  const photo = await getHomeownerProfilePhoto(user.tenantId, user.id);
  if (photo?.storedName && isSafeStoredName(photo.storedName)) {
    await unlink(path.join(profilePhotoDirectory(user.tenant.slug, user.id), photo.storedName)).catch(() => undefined);
  }
  await deleteHomeownerProfilePhoto(user.tenantId, user.id);
  await writeAuditLog({
    actorId: user.id,
    module: "HOMEOWNER_PROFILE",
    action: "REMOVE_PROFILE_PHOTO",
    entityType: "User",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true });
}

function profilePhotoDirectory(tenantSlug: string, userId: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeUserId || safeUserId !== userId) throw new Error("Invalid profile photo owner.");
  return tenantUploadDirectory(tenantSlug, "profile", safeUserId);
}

function isSafeStoredName(value: string) {
  return /^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(value);
}

function extensionFor(contentType: string) {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  return ".jpg";
}

function matchesImageSignature(bytes: Buffer, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}
