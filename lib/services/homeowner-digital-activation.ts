import { HomeownerActivationStatus, type HomeownerEmailVerificationStatus, type HomeownerStatus, type NotificationStatus } from "@prisma/client";

export type HomeownerDigitalActivationProfile = {
  tenantId: string;
  accountNumber?: string | null;
  status: HomeownerStatus | string;
  activationStatus: HomeownerActivationStatus | string;
  emailStatus: HomeownerEmailVerificationStatus | string;
  activationSentAt?: Date | null;
  activatedAt?: Date | null;
  user: { active: boolean; email?: string | null };
};

export type HomeownerDeliveryStatus = {
  status: NotificationStatus | string;
  createdAt: Date;
  sentAt?: Date | null;
  errorMessage?: string | null;
} | null;

const LEGACY_PENDING: string = "PENDING_ACTIVATION";
const HOMEOWNER_NO_EMAIL_DOMAIN = "no-email.hoahub.invalid";

export function homeownerNoEmailAddress(accountNumber: string) {
  if (!/^[1-9][0-9]{10}$/.test(accountNumber)) throw new Error("A valid homeowner account number is required for the internal no-email address.");
  return `no-email+${accountNumber}@${HOMEOWNER_NO_EMAIL_DOMAIN}`;
}

export function isHomeownerNoEmailAddress(value?: string | null) {
  return Boolean(value && value.toLowerCase().endsWith(`@${HOMEOWNER_NO_EMAIL_DOMAIN}`));
}

export function hasHomeownerContactEmail(value?: string | null) {
  return Boolean(value?.trim()) && !isHomeownerNoEmailAddress(value);
}

export function homeownerContactEmail(value?: string | null) {
  return hasHomeownerContactEmail(value) ? value!.trim() : "";
}

export function homeownerHasCompletedDigitalActivation(homeowner: HomeownerDigitalActivationProfile) {
  return homeowner.activationStatus === HomeownerActivationStatus.ACTIVE && Boolean(homeowner.activatedAt);
}

export function homeownerDigitalActivationEligibility(homeowner: HomeownerDigitalActivationProfile) {
  if (homeowner.tenantId === "") return { eligible: false, reason: "Homeowner tenant is missing." };
  if (homeowner.status !== "ACTIVE") return { eligible: false, reason: "Operational homeowner record is not active." };
  if (!homeowner.user.active) return { eligible: false, reason: "Digital user access is disabled." };
  if (!hasHomeownerContactEmail(homeowner.user.email)) return { eligible: false, reason: "Registered email is missing." };
  if (!/^[1-9][0-9]{10}$/.test(homeowner.accountNumber || "")) return { eligible: false, reason: "Valid 11-digit account number is missing." };
  if (homeownerHasCompletedDigitalActivation(homeowner)) return { eligible: false, reason: "Digital account is already activated." };
  if (homeowner.activationStatus === HomeownerActivationStatus.DISABLED) return { eligible: false, reason: "Digital access is disabled." };
  return { eligible: true, reason: "Eligible for first-time digital activation invitation." };
}

export function nextInvitationStatus(current: HomeownerActivationStatus | string) {
  if (current === HomeownerActivationStatus.EMAIL_PENDING_VERIFICATION) return HomeownerActivationStatus.EMAIL_PENDING_VERIFICATION;
  if (current === HomeownerActivationStatus.PASSWORD_CREATION_REQUIRED) return HomeownerActivationStatus.PASSWORD_CREATION_REQUIRED;
  return HomeownerActivationStatus.INVITATION_SENT;
}

export function digitalActivationLabel(value: HomeownerActivationStatus | string) {
  if (value === LEGACY_PENDING) return "Invitation Sent";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function activationInvitationExpiresAt(homeowner: Pick<HomeownerDigitalActivationProfile, "activationSentAt">) {
  if (!homeowner.activationSentAt) return null;
  return new Date(homeowner.activationSentAt.getTime() + 7 * 24 * 60 * 60 * 1000);
}

export function maskEmail(value?: string | null) {
  if (!hasHomeownerContactEmail(value)) return "Not registered";
  const [local, domain = ""] = value!.split("@");
  if (!domain) return `${value!.slice(0, 1)}***`;
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain.slice(0, 1)}***`;
}

export function maskAccountNumber(value?: string | null) {
  if (!value || !/^[1-9][0-9]{10}$/.test(value)) return "Not assigned";
  return `${value.slice(0, 2)}*******${value.slice(-2)}`;
}

export function deliveryStatusLabel(delivery: HomeownerDeliveryStatus) {
  if (!delivery) return "No delivery attempt";
  if (delivery.status === "SENT") return delivery.sentAt ? `Sent ${delivery.sentAt.toLocaleDateString("en-PH")}` : "Sent";
  if (delivery.status === "FAILED") return "Failed";
  return String(delivery.status).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
