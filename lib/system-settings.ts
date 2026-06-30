import "server-only";

import { SystemSettingCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

export type SettingField = {
  category: SystemSettingCategory;
  key: string;
  label: string;
  help: string;
  secret?: boolean;
  multiline?: boolean;
  placeholder?: string;
};

export const settingSections: { category: SystemSettingCategory; title: string; description: string; fields: SettingField[] }[] = [
  {
    category: SystemSettingCategory.ASSOCIATION,
    title: "Association profile",
    description: "Used across website pages, receipts, payslips, reports, email templates, and other generated documents.",
    fields: [
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_NAME", label: "Association name", help: "Main organization name printed on pages and documents.", placeholder: "PAGSIBOL VILLAGE PH2 4B EAST" },
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_ADDRESS", label: "Address", help: "Official HOA office or association address.", placeholder: "Pagsibol Village Phase 2 4B East" },
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_CONTACT_NUMBER", label: "Contact number", help: "Phone or mobile number shown on official documents.", placeholder: "09XXXXXXXXX" },
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_EMAIL", label: "Email address", help: "Official email address shown on receipts, forms, reports, and certificates.", placeholder: "office@pagsibolhoa.org" },
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_TIN_NUMBER", label: "TIN number", help: "Tax identification number shown on receipts and reports when configured.", placeholder: "000-000-000-000" },
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_SEC_REGISTRATION_NUMBER", label: "SEC registration number", help: "Official SEC registration number printed on association documents.", placeholder: "CN2024XXXXXXXX" },
      { category: SystemSettingCategory.ASSOCIATION, key: "ASSOCIATION_LOGO_URL", label: "Association logo URL", help: "Use /pagsibol-logo.png for the built-in logo, or paste a hosted logo image URL.", placeholder: "/pagsibol-logo.png" },
    ],
  },
  {
    category: SystemSettingCategory.DATABASE,
    title: "Database connection",
    description: "Store the production database connection string and provider notes. Changing the live database still requires a server restart.",
    fields: [
      { category: SystemSettingCategory.DATABASE, key: "DATABASE_URL", label: "MySQL connection string", help: "Example: mysql://user:password@host:3306/hoa_portal", secret: true, placeholder: "mysql://..." },
      { category: SystemSettingCategory.DATABASE, key: "DATABASE_PROVIDER", label: "Database provider", help: "MySQL 8.0 or newer is required for this portal.", placeholder: "MySQL" },
    ],
  },
  {
    category: SystemSettingCategory.EMAIL,
    title: "Email setup",
    description: "Non-secret SMTP and sender settings. Gmail username and App Password are read only from server environment variables and are never displayed here.",
    fields: [
      { category: SystemSettingCategory.EMAIL, key: "MAIL_PROVIDER", label: "Mail provider", help: "Use gmail for Google Workspace or Gmail App Password delivery.", placeholder: "gmail" },
      { category: SystemSettingCategory.EMAIL, key: "MAIL_HOST", label: "SMTP host", help: "Gmail SMTP server is smtp.gmail.com.", placeholder: "smtp.gmail.com" },
      { category: SystemSettingCategory.EMAIL, key: "MAIL_PORT", label: "SMTP port", help: "Use 587 with TLS or 465 with SSL.", placeholder: "587" },
      { category: SystemSettingCategory.EMAIL, key: "MAIL_ENCRYPTION", label: "Encryption", help: "Accepted values: tls, ssl, or none.", placeholder: "tls" },
      { category: SystemSettingCategory.EMAIL, key: "MAIL_FROM_NAME", label: "Sender name", help: "Friendly name displayed in homeowner inboxes.", placeholder: "HOA Digital Hub" },
      { category: SystemSettingCategory.EMAIL, key: "MAIL_FROM_ADDRESS", label: "Sender email", help: "Must normally match the Gmail account configured on the server.", placeholder: "hoa@example.com" },
      { category: SystemSettingCategory.EMAIL, key: "PASSWORD_RESET_EXPIRY_MINUTES", label: "Reset link expiry (minutes)", help: "Password reset links expire after this duration, from 30 to 60 minutes.", placeholder: "60" },
      { category: SystemSettingCategory.EMAIL, key: "PASSWORD_MIN_LENGTH", label: "Minimum password length", help: "Allowed range is 8 to 72 characters.", placeholder: "10" },
      { category: SystemSettingCategory.EMAIL, key: "PASSWORD_REQUIRE_UPPERCASE", label: "Require uppercase", help: "Enter true or false.", placeholder: "true" },
      { category: SystemSettingCategory.EMAIL, key: "PASSWORD_REQUIRE_LOWERCASE", label: "Require lowercase", help: "Enter true or false.", placeholder: "true" },
      { category: SystemSettingCategory.EMAIL, key: "PASSWORD_REQUIRE_NUMBER", label: "Require number", help: "Enter true or false.", placeholder: "true" },
      { category: SystemSettingCategory.EMAIL, key: "PASSWORD_REQUIRE_SPECIAL", label: "Require special character", help: "Enter true or false.", placeholder: "true" },
    ],
  },
  {
    category: SystemSettingCategory.FACEBOOK,
    title: "Facebook connection",
    description: "Used when posting announcements and events to the HOA Facebook Page.",
    fields: [
      { category: SystemSettingCategory.FACEBOOK, key: "FACEBOOK_GRAPH_API_VERSION", label: "Graph API version", help: "Example: v23.0", placeholder: "v23.0" },
      { category: SystemSettingCategory.FACEBOOK, key: "FACEBOOK_PAGE_ID", label: "Facebook Page ID", help: "The HOA page ID that will receive posts." },
      { category: SystemSettingCategory.FACEBOOK, key: "FACEBOOK_PAGE_ACCESS_TOKEN", label: "Page access token", help: "Token with permission to publish to the HOA Page.", secret: true },
      { category: SystemSettingCategory.FACEBOOK, key: "FACEBOOK_MESSENGER_ACCESS_TOKEN", label: "Messenger access token", help: "Placeholder for future Messenger reminders.", secret: true },
    ],
  },
  {
    category: SystemSettingCategory.PAYMENT,
    title: "GCash and QR payments",
    description: "Shown to homeowners on the QR payment page and used by the payment webhook placeholder.",
    fields: [
      { category: SystemSettingCategory.PAYMENT, key: "GCASH_ACCOUNT_NAME", label: "GCash account name", help: "Name that homeowners should verify before sending payment.", placeholder: "Pagsibol Village HOA" },
      { category: SystemSettingCategory.PAYMENT, key: "GCASH_MOBILE_NUMBER", label: "GCash mobile number", help: "Mobile number where payments should be sent.", placeholder: "09XXXXXXXXX" },
      { category: SystemSettingCategory.PAYMENT, key: "GCASH_QR_IMAGE_URL", label: "GCash QR image", help: "Upload the official GCash QR image directly. The system stores its internal file path." },
      { category: SystemSettingCategory.PAYMENT, key: "PAYMENT_INSTRUCTIONS", label: "Payment instructions", help: "Shown on QR page and billing reminders.", multiline: true, placeholder: "Scan the QR code, pay the exact amount, then submit the reference number." },
      { category: SystemSettingCategory.PAYMENT, key: "PAYMENT_WEBHOOK_SECRET", label: "Payment webhook secret", help: "Shared secret for a future payment gateway webhook that can auto-approve verified payments.", secret: true },
    ],
  },
  {
    category: SystemSettingCategory.CHAT,
    title: "Chat and attachments",
    description: "Controls the HOA Chat Center file upload rules and live messaging behavior.",
    fields: [
      { category: SystemSettingCategory.CHAT, key: "CHAT_MAX_ATTACHMENT_MB", label: "Maximum attachment size MB", help: "Maximum size per uploaded chat file.", placeholder: "10" },
      { category: SystemSettingCategory.CHAT, key: "CHAT_ALLOWED_MIME_TYPES", label: "Allowed attachment file types", help: "Comma-separated MIME types. Images, PDF, Word and Excel are enabled by default.", multiline: true, placeholder: "image/jpeg,image/png,image/webp,application/pdf" },
      { category: SystemSettingCategory.CHAT, key: "CHAT_POLL_INTERVAL_SECONDS", label: "Chat refresh interval seconds", help: "How often the chat client checks for new messages and presence updates.", placeholder: "5" },
    ],
  },
];

export const allSettingFields = settingSections.flatMap((section) => section.fields);

export function settingField(category: SystemSettingCategory, key: string) {
  return allSettingFields.find((field) => field.category === category && field.key === key);
}

export async function getSystemSettingMap() {
  const settings = await prisma.systemSetting.findMany();
  return new Map(settings.map((setting) => [`${setting.category}.${setting.key}`, setting]));
}

export async function getSystemSettingValue(category: SystemSettingCategory, key: string) {
  const setting = await prisma.systemSetting.findUnique({ where: { category_key: { category, key } }, select: { value: true } });
  return setting?.value?.trim() || "";
}

export async function getPasswordPolicy() {
  const map = await getSystemSettingMap();
  const value = (key: string, fallback: string) => map.get(`${SystemSettingCategory.EMAIL}.${key}`)?.value?.trim() || process.env[key]?.trim() || fallback;
  const enabled = (key: string, fallback = "true") => value(key, fallback).toLowerCase() === "true";
  return {
    minLength: Math.max(8, Math.min(72, Number(value("PASSWORD_MIN_LENGTH", "10")) || 10)),
    expiryMinutes: Math.max(30, Math.min(60, Number(value("PASSWORD_RESET_EXPIRY_MINUTES", "60")) || 60)),
    requireUppercase: enabled("PASSWORD_REQUIRE_UPPERCASE"),
    requireLowercase: enabled("PASSWORD_REQUIRE_LOWERCASE"),
    requireNumber: enabled("PASSWORD_REQUIRE_NUMBER"),
    requireSpecial: enabled("PASSWORD_REQUIRE_SPECIAL"),
  };
}

export async function getPaymentSettings() {
  const map = await getSystemSettingMap();
  const value = (key: string) => map.get(`${SystemSettingCategory.PAYMENT}.${key}`)?.value?.trim() || "";
  return {
    gcashAccountName: value("GCASH_ACCOUNT_NAME"),
    gcashMobileNumber: value("GCASH_MOBILE_NUMBER"),
    gcashQrImageUrl: value("GCASH_QR_IMAGE_URL"),
    paymentInstructions: value("PAYMENT_INSTRUCTIONS"),
    paymentWebhookSecret: value("PAYMENT_WEBHOOK_SECRET"),
  };
}

export async function getAssociationSettings() {
  const map = await getSystemSettingMap();
  const value = (key: string, fallback = "") => map.get(`${SystemSettingCategory.ASSOCIATION}.${key}`)?.value?.trim() || process.env[key]?.trim() || fallback;
  const name = value("ASSOCIATION_NAME", "PAGSIBOL VILLAGE PH2 4B EAST");
  const logoUrl = value("ASSOCIATION_LOGO_URL", "/pagsibol-logo.png");
  return {
    name,
    address: value("ASSOCIATION_ADDRESS", "Pagsibol Village Phase 2 4B East"),
    contactNumber: value("ASSOCIATION_CONTACT_NUMBER"),
    email: value("ASSOCIATION_EMAIL"),
    tinNumber: value("ASSOCIATION_TIN_NUMBER"),
    secRegistrationNumber: value("ASSOCIATION_SEC_REGISTRATION_NUMBER"),
    logoUrl: logoUrl || "/pagsibol-logo.png",
    documentTitle: `${name} Homeowners Association`,
  };
}

export async function getChatSettings() {
  const map = await getSystemSettingMap();
  const value = (key: string, fallback: string) => map.get(`${SystemSettingCategory.CHAT}.${key}`)?.value?.trim() || fallback;
  const defaultTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  const allowedMimeTypes = value("CHAT_ALLOWED_MIME_TYPES", defaultTypes.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    maxAttachmentMb: Math.max(1, Math.min(50, Number(value("CHAT_MAX_ATTACHMENT_MB", "10")) || 10)),
    allowedMimeTypes,
    pollIntervalSeconds: Math.max(3, Math.min(60, Number(value("CHAT_POLL_INTERVAL_SECONDS", "5")) || 5)),
  };
}

export function maskedSecret(value?: string | null) {
  return value ? "Saved secret hidden for security. Leave blank to keep it unchanged." : "No secret saved yet.";
}
