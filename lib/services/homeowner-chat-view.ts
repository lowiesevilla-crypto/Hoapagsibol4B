import { Role } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type HomeownerSafeNode<T> =
  T extends readonly (infer Item)[] ? HomeownerSafeNode<Item>[] :
  T extends { homeownerProfile: unknown; email: string; searchText: string }
    ? Omit<{ [Key in keyof T]: HomeownerSafeNode<T[Key]> }, "homeownerProfile" | "email" | "avatarUrl" | "searchText"> & {
        homeownerProfile: null;
        email: string;
        avatarUrl: string | null;
        searchText: string;
      }
    : T extends object
      ? { [Key in keyof T]: HomeownerSafeNode<T[Key]> }
      : T;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: JsonRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeNode(item));
  if (!isRecord(value)) return value;

  const sourceProfile = isRecord(value.homeownerProfile) ? value.homeownerProfile : null;
  const sanitized: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) sanitized[key] = sanitizeNode(child);

  if (value.role === Role.HOMEOWNER && typeof value.name === "string") {
    const block = stringField(sourceProfile, "block");
    const lot = stringField(sourceProfile, "lot");
    sanitized.email = "";
    sanitized.homeownerProfile = null;
    sanitized.avatarUrl = typeof value.id === "string" ? `/api/profile/photo/${encodeURIComponent(value.id)}` : null;
    sanitized.searchText = [
      value.name,
      "homeowner",
      "resident",
      block,
      lot,
      block ? `block ${block}` : "",
      block ? `blk ${block}` : "",
      lot ? `lot ${lot}` : "",
      block && lot ? `block ${block} lot ${lot}` : "",
      block && lot ? `blk ${block} lot ${lot}` : "",
    ].filter(Boolean).join(" ").toLowerCase();
  }

  return sanitized;
}

/**
 * Removes resident property/contact metadata from homeowner-facing chat payloads.
 * Block and lot remain searchable only through the derived searchText string; the
 * structured homeowner profile (including address) is never sent to the browser.
 * A same-tenant authenticated avatar URL is safe to expose because the image route
 * performs its own tenant and active-homeowner authorization before serving bytes.
 *
 * The return type intentionally reflects the browser-safe shape so TypeScript cannot
 * require the original structured homeowner profile at the homeowner UI boundary.
 */
export function sanitizeHomeownerChatPayload<T>(payload: T): HomeownerSafeNode<T> {
  return sanitizeNode(payload) as HomeownerSafeNode<T>;
}
