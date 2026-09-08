import { resolveTxt } from "node:dns/promises";
import type { MailConfiguration } from "@/lib/services/notifications";

export type DeliverabilityCheckStatus = "PASS" | "WARN" | "FAIL";

export type DeliverabilityCheck = {
  key: "sender" | "spf" | "dkim" | "dmarc" | "appUrl";
  label: string;
  status: DeliverabilityCheckStatus;
  message: string;
};

const DNS_TIMEOUT_MS = 1500;

export async function assessEmailDeliverability(config: MailConfiguration, options?: { dkimSelector?: string }) {
  const senderDomain = emailDomain(config.fromAddress);
  const configuredSenderDomain = emailDomain(config.configuredFromAddress);
  const appUrl = config.appUrl;
  const [spfRecords, dmarcRecords, dkimRecords] = await Promise.all([
    senderDomain ? resolveTxtRecords(senderDomain) : Promise.resolve(null),
    senderDomain ? resolveTxtRecords(`_dmarc.${senderDomain}`) : Promise.resolve(null),
    senderDomain && options?.dkimSelector ? resolveTxtRecords(`${options.dkimSelector}._domainkey.${senderDomain}`) : Promise.resolve(null),
  ]);

  const checks: DeliverabilityCheck[] = [
    senderCheck(config, senderDomain, configuredSenderDomain),
    spfCheck(senderDomain, spfRecords),
    dkimCheck(senderDomain, options?.dkimSelector, dkimRecords),
    dmarcCheck(senderDomain, dmarcRecords),
    appUrlCheck(appUrl),
  ];
  const releaseReady = checks.every((check) => check.status === "PASS");
  return { senderDomain, checks, releaseReady };
}

function senderCheck(config: MailConfiguration, senderDomain: string, configuredSenderDomain: string): DeliverabilityCheck {
  if (!senderDomain) {
    return { key: "sender", label: "Sender alignment", status: "FAIL", message: "A valid sender email is required before outbound mail should be used." };
  }
  if (config.senderAddressAdjusted) {
    return { key: "sender", label: "Sender alignment", status: "WARN", message: `HOAHub will send as ${config.fromAddress} because the configured sender is not authorized for this SMTP mailbox.` };
  }
  if (configuredSenderDomain && configuredSenderDomain !== senderDomain) {
    return { key: "sender", label: "Sender alignment", status: "WARN", message: "The configured sender domain differs from the effective sender domain used for SMTP." };
  }
  if (config.username && emailDomain(config.username) && emailDomain(config.username) !== senderDomain) {
    return { key: "sender", label: "Sender alignment", status: "WARN", message: "The SMTP username domain differs from the visible From address domain; confirm the provider authorizes this sender." };
  }
  return { key: "sender", label: "Sender alignment", status: "PASS", message: `Effective sender domain is ${senderDomain}.` };
}

function spfCheck(senderDomain: string, records: string[] | null): DeliverabilityCheck {
  if (!senderDomain) return { key: "spf", label: "SPF", status: "FAIL", message: "Cannot check SPF until the sender domain is configured." };
  if (records === null) return { key: "spf", label: "SPF", status: "WARN", message: "SPF DNS lookup was unavailable. Verify the sender domain has exactly one SPF record before production sending." };
  const spf = records.filter((record) => /^v=spf1\b/i.test(record));
  if (spf.length === 1) return { key: "spf", label: "SPF", status: "PASS", message: "Sender domain has one SPF record." };
  if (spf.length > 1) return { key: "spf", label: "SPF", status: "FAIL", message: "Sender domain has multiple SPF records; mailbox providers can treat this as SPF failure." };
  return { key: "spf", label: "SPF", status: "FAIL", message: "Sender domain has no SPF record. Add the provider's SPF include before sending activation mail at scale." };
}

function dkimCheck(senderDomain: string, selector: string | undefined, records: string[] | null): DeliverabilityCheck {
  if (!senderDomain) return { key: "dkim", label: "DKIM", status: "FAIL", message: "Cannot check DKIM until the sender domain is configured." };
  if (!selector) return { key: "dkim", label: "DKIM", status: "WARN", message: "Add the provider DKIM selector in Mail Settings, then verify the DKIM TXT record before production sending." };
  if (records === null) return { key: "dkim", label: "DKIM", status: "WARN", message: `DKIM DNS lookup for ${selector}._domainkey.${senderDomain} was unavailable.` };
  const hasDkim = records.some((record) => /^v=DKIM1\b/i.test(record) || /\bp=/.test(record));
  return hasDkim
    ? { key: "dkim", label: "DKIM", status: "PASS", message: "DKIM selector record is present." }
    : { key: "dkim", label: "DKIM", status: "FAIL", message: "DKIM selector record was not found. Configure provider DKIM signing before production sending." };
}

function dmarcCheck(senderDomain: string, records: string[] | null): DeliverabilityCheck {
  if (!senderDomain) return { key: "dmarc", label: "DMARC", status: "FAIL", message: "Cannot check DMARC until the sender domain is configured." };
  if (records === null) return { key: "dmarc", label: "DMARC", status: "WARN", message: "DMARC DNS lookup was unavailable. Verify DMARC and alignment before production sending." };
  const dmarc = records.find((record) => /^v=DMARC1\b/i.test(record));
  if (!dmarc) return { key: "dmarc", label: "DMARC", status: "FAIL", message: "Sender domain has no DMARC record. Add DMARC so mailbox providers can authenticate aligned mail." };
  if (/\bp=none\b/i.test(dmarc)) return { key: "dmarc", label: "DMARC", status: "WARN", message: "DMARC exists with p=none. This is acceptable for monitoring, but quarantine/reject gives stronger domain protection." };
  return { key: "dmarc", label: "DMARC", status: "PASS", message: "DMARC record is present with an enforcing policy." };
}

function appUrlCheck(appUrl: string): DeliverabilityCheck {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return { key: "appUrl", label: "Activation links", status: "FAIL", message: "Production activation links must use HTTPS." };
    }
    return { key: "appUrl", label: "Activation links", status: "PASS", message: `Activation links use ${parsed.protocol.replace(":", "").toUpperCase()}.` };
  } catch {
    return { key: "appUrl", label: "Activation links", status: "FAIL", message: "APP_URL must be a valid public URL for activation email links." };
  }
}

function emailDomain(value: string | null | undefined) {
  const at = String(value || "").trim().toLowerCase().lastIndexOf("@");
  return at > 0 ? String(value).trim().toLowerCase().slice(at + 1) : "";
}

async function resolveTxtRecords(name: string) {
  try {
    const records = await withTimeout(resolveTxt(name), DNS_TIMEOUT_MS);
    return records.map((record) => record.join(""));
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("DNS lookup timed out.")), timeoutMs)),
  ]);
}
