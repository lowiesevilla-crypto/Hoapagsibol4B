import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type AssociationLogoAsset = {
  bytes: Uint8Array;
  type: "png" | "jpg";
};

const transparentPng = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

export async function getAssociationLogoAsset(logoUrl: string): Promise<AssociationLogoAsset> {
  try {
    if (!logoUrl.trim()) return { bytes: transparentPng, type: "png" };
    if (/^https?:\/\//i.test(logoUrl)) {
      const response = await fetch(logoUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Logo returned HTTP ${response.status}.`);
      const contentType = response.headers.get("content-type") || "";
      return { bytes: new Uint8Array(await response.arrayBuffer()), type: contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png" };
    }

    const localPath = path.join(process.cwd(), "public", logoUrl.replace(/^\/+/, ""));
    return { bytes: await readFile(localPath), type: localPath.toLowerCase().endsWith(".jpg") || localPath.toLowerCase().endsWith(".jpeg") ? "jpg" : "png" };
  } catch {
    return { bytes: transparentPng, type: "png" };
  }
}
