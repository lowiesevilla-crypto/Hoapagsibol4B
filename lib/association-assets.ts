import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type AssociationLogoAsset = {
  bytes: Uint8Array;
  type: "png" | "jpg";
};

export async function getAssociationLogoAsset(logoUrl: string): Promise<AssociationLogoAsset> {
  const fallback = path.join(process.cwd(), "public", "pagsibol-logo.png");
  try {
    if (/^https?:\/\//i.test(logoUrl)) {
      const response = await fetch(logoUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Logo returned HTTP ${response.status}.`);
      const contentType = response.headers.get("content-type") || "";
      return { bytes: new Uint8Array(await response.arrayBuffer()), type: contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png" };
    }

    const localPath = path.join(process.cwd(), "public", logoUrl.replace(/^\/+/, ""));
    return { bytes: await readFile(localPath), type: localPath.toLowerCase().endsWith(".jpg") || localPath.toLowerCase().endsWith(".jpeg") ? "jpg" : "png" };
  } catch {
    return { bytes: await readFile(fallback), type: "png" };
  }
}
