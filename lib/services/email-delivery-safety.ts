import { createHash } from "node:crypto";

export type EmailRecipientValidationCode =
  | "VALID"
  | "EMPTY"
  | "INVALID_FORMAT"
  | "INTERNAL_PLACEHOLDER"
  | "NON_DELIVERABLE_DOMAIN";

export type EmailRecipientValidation = {
  valid: boolean;
  code: EmailRecipientValidationCode;
  normalizedEmail: string;
  maskedEmail: string;
  fingerprint: string;
  reason?: string;
};

export type MailFailureKind = "PERMANENT_RECIPIENT" | "TEMPORARY" | "PROVIDER_CIRCUIT" | "UNKNOWN";

export type MailFailureClassification = {
  kind: MailFailureKind;
  code: string;
  message: string;
  responseCode?: number;
  retryAfterMs?: number;
};

const HOMEOWNER_NO_EMAIL_DOMAIN = "no-email.hoahub.invalid";
const RESERVED_NON_DELIVERABLE_TLDS = new Set(["invalid", "localhost", "test", "example"]);

export function normalizeEmailRecipient(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function emailRecipientFingerprint(value: string | null | undefined) {
  return createHash("sha256").update(normalizeEmailRecipient(value)).digest("hex");
}

export function maskEmailAddress(value: string | null | undefined) {
  const normalized = normalizeEmailRecipient(value);
  if (!normalized) return "not-provided";
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return `${normalized.slice(0, 1)}***`;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local.slice(0, 1)}***` : `${local.slice(0, 1)}***${local.slice(-1)}`;
  const [firstLabel = "", ...rest] = domain.split(".");
  const maskedDomain = rest.length
    ? `${firstLabel.slice(0, 1)}***.${rest.join(".")}`
    : `${firstLabel.slice(0, 1)}***`;
  return `${maskedLocal}@${maskedDomain}`;
}

export function validateEmailRecipient(value: string | null | undefined): EmailRecipientValidation {
  const normalizedEmail = normalizeEmailRecipient(value);
  const fingerprint = emailRecipientFingerprint(normalizedEmail);
  const maskedEmail = maskEmailAddress(normalizedEmail);
  if (!normalizedEmail) {
    return { valid: false, code: "EMPTY", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email is missing." };
  }
  if (normalizedEmail.length > 254 || /[\s\u0000-\u001f\u007f]/.test(normalizedEmail)) {
    return { valid: false, code: "INVALID_FORMAT", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email format is invalid." };
  }

  const at = normalizedEmail.lastIndexOf("@");
  if (at <= 0 || at !== normalizedEmail.indexOf("@")) {
    return { valid: false, code: "INVALID_FORMAT", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email format is invalid." };
  }
  const local = normalizedEmail.slice(0, at);
  const domain = normalizedEmail.slice(at + 1);
  if (!local || local.length > 64 || !domain || domain.length > 253) {
    return { valid: false, code: "INVALID_FORMAT", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email format is invalid." };
  }
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { valid: false, code: "INVALID_FORMAT", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email format is invalid." };
  }

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    return { valid: false, code: "INVALID_FORMAT", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email domain is invalid." };
  }
  if (domain === HOMEOWNER_NO_EMAIL_DOMAIN || domain.endsWith(`.${HOMEOWNER_NO_EMAIL_DOMAIN}`)) {
    return { valid: false, code: "INTERNAL_PLACEHOLDER", normalizedEmail, fingerprint, maskedEmail, reason: "Internal HOAHub no-email placeholder addresses are never sent through SMTP." };
  }
  const tld = labels.at(-1) || "";
  if (RESERVED_NON_DELIVERABLE_TLDS.has(tld)) {
    return { valid: false, code: "NON_DELIVERABLE_DOMAIN", normalizedEmail, fingerprint, maskedEmail, reason: "Recipient email uses a reserved non-deliverable domain." };
  }
  return { valid: true, code: "VALID", normalizedEmail, fingerprint, maskedEmail };
}

export function classifyMailFailure(error: unknown): MailFailureClassification {
  const details = error as { code?: string; responseCode?: number; message?: string; response?: string };
  const responseCode = Number(details?.responseCode || 0) || undefined;
  const raw = [error instanceof Error ? error.message : details?.message, details?.response].filter(Boolean).join(" ");
  const message = raw.replace(/[\r\n]+/g, " ").slice(0, 500) || "Email delivery failed.";
  const lower = message.toLowerCase();
  const code = String(details?.code || "SMTP_ERROR").toUpperCase();

  const providerCircuit =
    code === "EAUTH" || responseCode === 535 || responseCode === 530 ||
    /authentication failed|invalid login|account.*suspend|mailbox.*suspend|account.*disabled|sending.*disabled|sender address rejected|not owned by user|daily.*limit|hourly.*limit|sending limit|quota exceeded|too many messages|rate.?limit|spam policy|temporarily suspended/.test(lower);
  if (providerCircuit) {
    const longCircuit = /authentication|invalid login|suspend|disabled|sender address rejected|not owned by user/.test(lower) || code === "EAUTH" || responseCode === 535 || responseCode === 530;
    return {
      kind: "PROVIDER_CIRCUIT",
      code,
      message,
      responseCode,
      retryAfterMs: longCircuit ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000,
    };
  }

  const permanentRecipient =
    /5\.1\.1|user unknown|unknown user|no such user|recipient address rejected|invalid recipient|recipient rejected|mailbox does not exist|mailbox unavailable/.test(lower) ||
    ((responseCode === 550 || responseCode === 551 || responseCode === 553) && /recipient|user|mailbox|address/.test(lower));
  if (permanentRecipient) {
    return { kind: "PERMANENT_RECIPIENT", code, message, responseCode };
  }

  const temporary =
    (responseCode !== undefined && responseCode >= 400 && responseCode < 500) ||
    ["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "ESOCKET", "EDNS"].includes(code) ||
    /timeout|temporar|try again|connection reset|connection closed|service unavailable/.test(lower);
  if (temporary) {
    return { kind: "TEMPORARY", code, message, responseCode, retryAfterMs: 15 * 60 * 1000 };
  }

  return { kind: "UNKNOWN", code, message, responseCode };
}
