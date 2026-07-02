import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";
const MASKED_SECRET = /^(?:\*{4,}|\u2022{4,}|configured\s*-?\s*hidden)$/i;

function encryptionKey() {
  const source = process.env.SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!source || source.length < 32) {
    throw new Error("AUTH_SECRET or SETTINGS_ENCRYPTION_KEY must contain at least 32 characters before secrets can be saved.");
  }
  return createHash("sha256").update(source).digest();
}

export function isMaskedSecret(value: string) {
  return MASKED_SECRET.test(value.trim());
}

export function encryptSettingSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function resolveSettingSecretSubmission(value: string, existing?: string | null) {
  if (value === "" || isMaskedSecret(value)) return { preserve: true as const, value: existing || null };
  return { preserve: false as const, value: encryptSettingSecret(value) };
}

export function decryptSettingSecret(value: string) {
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const [, , ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("The saved SMTP credential is invalid. Enter and save it again.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The saved SMTP credential cannot be decrypted. Enter and save it again.");
  }
}
