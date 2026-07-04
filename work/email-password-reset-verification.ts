import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import Module from "node:module";
import { NotificationType, PrismaClient, SystemSettingCategory } from "@prisma/client";
import { hash } from "bcryptjs";
import { setTenantContext } from "../lib/tenant-context";

const prisma = new PrismaClient();
const configKeys = ["MAIL_PROVIDER", "MAIL_HOST", "MAIL_PORT", "MAIL_ENCRYPTION", "MAIL_USERNAME", "MAIL_PASSWORD", "MAIL_FROM_NAME", "MAIL_FROM_ADDRESS"];
const capturedMessages: string[] = [];

async function main() {
  setTenantContext({ tenantId: "tenant_pagsibol4b_default", platform: false });
  const previousUnauthenticated = process.env.SMTP_ALLOW_UNAUTHENTICATED;
  process.env.SMTP_ALLOW_UNAUTHENTICATED = "true";
  const moduleLoader = Module as typeof Module & { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function loadForVerification(request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "next/headers") return { headers: async () => new Headers({ "x-forwarded-for": "203.0.113.77", "x-forwarded-host": "pagsibol-hoa.tail2abf68.ts.net", "x-forwarded-proto": "https" }) };
    if (request === "next/navigation") return { redirect(url: string) { throw new Error(`Unexpected redirect: ${url}`); } };
    if (request === "@/lib/auth") return { deleteSession: async () => undefined };
    return originalLoad.call(this, request, parent, isMain);
  };
  const [{ sendEmailNotification, emailHtml, getMailConfiguration, resolveSenderAddress, safeMailError, smtpTransportOptions }, { getAssociationSettings, getPasswordPolicy }, { forgotPasswordAction }, { decryptSettingSecret, encryptSettingSecret, isMaskedSecret, resolveSettingSecretSubmission }] = await Promise.all([import("../lib/services/notifications"), import("../lib/system-settings"), import("../lib/actions/password-reset"), import("../lib/setting-secrets")]);
  const original = await prisma.systemSetting.findMany({ where: { category: SystemSettingCategory.EMAIL, key: { in: configKeys } } });
  const user = await prisma.user.create({ data: { name: "QA SMTP Recipient", email: `qa.smtp.${Date.now()}@example.test`, passwordHash: await hash(randomBytes(24).toString("base64url"), 12), role: "HOMEOWNER" } });
  const server = createTestSmtpServer();
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = (server.address() as AddressInfo).port;
  try {
    await setConfig("MAIL_PROVIDER", "smtp");
    await setConfig("MAIL_HOST", "127.0.0.1");
    await setConfig("MAIL_PORT", String(port));
    await setConfig("MAIL_ENCRYPTION", "none");
    await setConfig("MAIL_FROM_NAME", "HOA Digital Hub QA");
    await setConfig("MAIL_FROM_ADDRESS", "qa-sender@example.test");
    const log = await sendEmailNotification({ recipientId: user.id, email: user.email, subject: "HOA Digital Hub email test", heading: "SMTP verification", message: "This message verifies responsive branded SMTP delivery.", type: NotificationType.TEST_EMAIL, actionLabel: "Open test portal", actionUrl: "https://pagsibol-hoa.tail2abf68.ts.net/login" });
    await waitFor(() => capturedMessages.length > 0);
    const raw = capturedMessages.join("\n");
    const policy = await getPasswordPolicy();
    const renderedHtml = emailHtml({ subject: "HOA Digital Hub email test", heading: "SMTP verification", message: "This message verifies responsive branded SMTP delivery.", actionLabel: "Open test portal", actionUrl: "https://pagsibol-hoa.tail2abf68.ts.net/login" }, await getAssociationSettings(), "https://pagsibol-hoa.tail2abf68.ts.net");
    const legacySecrets = await prisma.systemSetting.count({ where: { category: SystemSettingCategory.EMAIL, key: { in: ["RESEND_API_KEY", "SMTP_USER", "SMTP_PASSWORD"] } } });
    const encryptedPassword = encryptSettingSecret(" example password with spaces ");
    const sslOptions = smtpTransportOptions({ host: "smtp.hostinger.com", port: 465, encryption: "ssl", username: "support@hoahub.tech", password: "secret" });
    const tlsOptions = smtpTransportOptions({ host: "smtp.hostinger.com", port: 587, encryption: "tls", username: "support@hoahub.tech", password: "secret" });
    const savedSecret = resolveSettingSecretSubmission("new password", null).value;
    const responses: string[] = [];
    for (let index = 0; index < 4; index += 1) { const form = new FormData(); form.set("email", user.email); responses.push((await forgotPasswordAction({}, form)).success || ""); }
    const emailHash = createHash("sha256").update(user.email).digest("hex");
    const attemptCount = await prisma.passwordResetAttempt.count({ where: { emailHash } });
    const rateAuditCount = await prisma.auditLog.count({ where: { action: "PASSWORD_RESET_RATE_LIMITED", metadata: { path: "$.emailFingerprint", equals: emailHash.slice(0, 12) } } });
    await setConfig("MAIL_PROVIDER", "support@hoahub.tech");
    await setConfig("MAIL_USERNAME", "support@hoahub.tech");
    await setConfig("MAIL_PASSWORD", encryptedPassword);
    const databaseMail = await getMailConfiguration();
    const checks = [
      [log.status === "SENT", "SMTP message status is SENT"],
      [Boolean(log.providerMessageId), "provider message id is logged"],
      [!log.errorMessage, "successful delivery has no error"],
      [raw.includes("Content-Type: text/html"), "responsive HTML email part is present"],
      [raw.includes("HOA Digital Hub email test"), "email subject is captured"],
      [renderedHtml.includes("Open test portal") && renderedHtml.includes("tail2abf68.ts.net/login"), "email action is rendered"],
      [renderedHtml.includes('name="viewport"') && renderedHtml.includes("max-width:680px"), "email template is responsive"],
      [policy.minLength >= 10 && policy.expiryMinutes >= 30 && policy.expiryMinutes <= 60, "password policy and expiry are enforced"],
      [legacySecrets === 0, "legacy database credential fields are removed"],
      [encryptedPassword !== " example password with spaces " && decryptSettingSecret(encryptedPassword) === " example password with spaces ", "database SMTP password is encrypted and decrypted without trimming"],
      [isMaskedSecret("********") && isMaskedSecret("••••••••"), "masked password placeholders are rejected"],
      [resolveSettingSecretSubmission("", savedSecret).value === savedSecret && resolveSettingSecretSubmission("********", savedSecret).value === savedSecret, "blank and masked password submissions preserve the saved secret"],
      [sslOptions.secure === true && sslOptions.requireTLS === false, "port 465 uses SSL with secure true"],
      [tlsOptions.secure === false && tlsOptions.requireTLS === true, "port 587 uses STARTTLS with secure false"],
      [databaseMail.provider === "smtp", "invalid legacy provider values normalize to smtp"],
      [databaseMail.username === "support@hoahub.tech" && databaseMail.password === " example password with spaces " && databaseMail.credentialSource === "database", "database SMTP credentials load and decrypt correctly"],
      [safeMailError(Object.assign(new Error("535 5.7.8 Invalid login"), { code: "EAUTH", responseCode: 535 })).startsWith("SMTP authentication failed"), "SMTP authentication failures return a clear password-safe message"],
      [resolveSenderAddress("smtp.hostinger.com", "admin@hoahub.tech", "noreply@hoahub.tech") === "admin@hoahub.tech", "Hostinger sender defaults to the authenticated mailbox"],
      [safeMailError(Object.assign(new Error("553 Sender address rejected: not owned by user"), { responseCode: 553 })).startsWith("SMTP sender address was rejected"), "Hostinger sender rejection returns a clear message"],
      [responses.length === 4 && new Set(responses).size === 1 && responses[0].startsWith("If that email"), "forgot-password response does not reveal account state"],
      [attemptCount === 4 && rateAuditCount === 1, "persistent per-email rate limiting is enforced and audited"],
    ] as const;
    for (const [passed, label] of checks) {
      if (!passed) throw new Error(`FAIL: ${label}`);
      console.log(`PASS: ${label}`);
    }
    console.log(`PASS ${checks.length} email and password-reset checks`);
  } finally {
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.auditLog.deleteMany({ where: { action: "PASSWORD_RESET_RATE_LIMITED", metadata: { path: "$.emailFingerprint", equals: createHash("sha256").update(user.email).digest("hex").slice(0, 12) } } });
    await prisma.passwordResetAttempt.deleteMany({ where: { emailHash: createHash("sha256").update(user.email).digest("hex") } });
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.systemSetting.deleteMany({ where: { category: SystemSettingCategory.EMAIL, key: { in: configKeys } } });
    if (original.length) await prisma.systemSetting.createMany({ data: original.map(({ id, category, key, label, value, isSecret, updatedById, createdAt, updatedAt }) => ({ id, category, key, label, value, isSecret, updatedById, createdAt, updatedAt })) });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    moduleLoader._load = originalLoad;
    if (previousUnauthenticated === undefined) delete process.env.SMTP_ALLOW_UNAUTHENTICATED;
    else process.env.SMTP_ALLOW_UNAUTHENTICATED = previousUnauthenticated;
    await prisma.$disconnect();
  }
}

function createTestSmtpServer() {
  return createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    socket.setEncoding("utf8");
    socket.write("220 localhost HOA SMTP verification\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (dataMode) {
        const end = buffer.indexOf("\r\n.\r\n");
        if (end < 0) return;
        capturedMessages.push(buffer.slice(0, end));
        buffer = buffer.slice(end + 5);
        dataMode = false;
        socket.write("250 2.0.0 accepted\r\n");
      }
      while (!dataMode) {
        const newline = buffer.indexOf("\r\n");
        if (newline < 0) break;
        const command = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        if (/^(EHLO|HELO)/i.test(command)) socket.write("250-localhost\r\n250 SIZE 10485760\r\n");
        else if (/^(MAIL FROM|RCPT TO|RSET|NOOP)/i.test(command)) socket.write("250 2.1.0 OK\r\n");
        else if (/^DATA/i.test(command)) { dataMode = true; socket.write("354 End data with <CR><LF>.<CR><LF>\r\n"); }
        else if (/^QUIT/i.test(command)) { socket.write("221 2.0.0 bye\r\n"); socket.end(); }
        else socket.write("250 OK\r\n");
      }
    });
  });
}

async function setConfig(key: string, value: string) {
  await prisma.systemSetting.upsert({ where: { tenantId_category_key: { tenantId: "tenant_pagsibol4b_default", category: SystemSettingCategory.EMAIL, key } }, create: { tenantId: "tenant_pagsibol4b_default", category: SystemSettingCategory.EMAIL, key, label: key, value }, update: { value } });
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("SMTP message was not received by the verification server.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
