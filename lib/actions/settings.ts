"use server";

import { NotificationStatus, NotificationType, Role, SystemSettingCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { prisma } from "@/lib/db";
import { removeStoredGcashQrImage, resolveGcashQrImage } from "@/lib/gcash-qr";
import { allSettingFields, settingField } from "@/lib/system-settings";
import { sendEmailNotification, verifyMailConnection } from "@/lib/services/notifications";
import { emailSettingsSchema, testEmailSchema } from "@/lib/validation";

export async function saveSystemSettingsAction(formData: FormData) {
  const systemAdmin = await requireUser(Role.SYSTEM_ADMIN);
  const category = String(formData.get("category") || "") as SystemSettingCategory;
  if (!Object.values(SystemSettingCategory).includes(category)) throw new Error("Invalid settings category.");
  const fields = allSettingFields.filter((field) => field.category === category);
  if (!fields.length) throw new Error("No settings are registered for this category.");
  if (category === SystemSettingCategory.EMAIL) {
    const parsed = emailSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) redirect(`/admin/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Check the email settings.")}`);
  }

  let obsoleteQrUrl: string | null = null;
  try {
    const currentQr = category === SystemSettingCategory.PAYMENT
      ? await prisma.systemSetting.findUnique({ where: { category_key: { category, key: "GCASH_QR_IMAGE_URL" } }, select: { value: true } })
      : null;
    const qrResolution = category === SystemSettingCategory.PAYMENT ? await resolveGcashQrImage(formData, currentQr?.value) : null;
    obsoleteQrUrl = qrResolution?.obsoleteUrl && qrResolution.obsoleteUrl !== qrResolution.url ? qrResolution.obsoleteUrl : null;

    await prisma.$transaction(async (tx) => {
      for (const field of fields) {
        const registered = settingField(category, field.key);
        if (!registered) continue;
        const raw = field.key === "GCASH_QR_IMAGE_URL" && qrResolution ? qrResolution.url ?? "" : String(formData.get(field.key) || "").trim();
        const existing = await tx.systemSetting.findUnique({ where: { category_key: { category, key: field.key } } });
        if (field.secret && raw === "" && existing) continue;
        await tx.systemSetting.upsert({
          where: { category_key: { category, key: field.key } },
          create: {
            category,
            key: field.key,
            label: field.label,
            value: raw || null,
            isSecret: Boolean(field.secret),
            updatedById: systemAdmin.id,
          },
          update: {
            label: field.label,
            value: raw || null,
            isSecret: Boolean(field.secret),
            updatedById: systemAdmin.id,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: systemAdmin.id,
          module: "SETTINGS",
          action: category === SystemSettingCategory.EMAIL ? "UPDATE_EMAIL_CONFIGURATION" : "UPDATE_SYSTEM_SETTINGS",
          entityType: "SystemSetting",
          entityId: category,
          metadata: { category, updatedKeys: fields.map((field) => field.key), secretValuesIncluded: false },
        },
      });
    });
  } catch (error) {
    redirect(`/admin/settings?error=${encodeURIComponent(error instanceof Error ? error.message : "Settings could not be saved.")}`);
  }

  if (obsoleteQrUrl) await removeStoredGcashQrImage(obsoleteQrUrl);

  revalidatePath("/admin/settings");
  revalidatePath("/portal/pay");
  redirect(`/admin/settings?success=saved&message=${encodeURIComponent(`${category.toLowerCase()} settings saved successfully.`)}`);
}

export async function sendTestEmailAction(formData: FormData) {
  const systemAdmin = await requireUser(Role.SYSTEM_ADMIN);
  const parsed = testEmailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/admin/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message || "Enter a valid email address.")}`);
  let outcome = "FAILED";
  let failure = "Test email could not be sent.";
  try {
    await verifyMailConnection();
    const log = await sendEmailNotification({
      recipientId: systemAdmin.id,
      email: parsed.data.email,
      subject: "HOA Digital Hub email test",
      heading: "Email configuration test",
      message: "This test confirms that the HOA Digital Hub can securely send email through the configured SMTP service.",
      type: NotificationType.TEST_EMAIL,
      actionLabel: "Open HOA Digital Hub",
      actionUrl: `${getAppUrl()}/login`,
    });
    if (log.status !== NotificationStatus.SENT) throw new Error(log.errorMessage || "SMTP accepted the connection but the test message was not sent.");
    outcome = "SENT";
  } catch (error) {
    failure = error instanceof Error ? error.message : failure;
  }
  await prisma.auditLog.create({ data: { actorId: systemAdmin.id, module: "EMAIL", action: "SEND_TEST_EMAIL", entityType: "User", entityId: systemAdmin.id, metadata: { recipient: parsed.data.email, outcome, error: outcome === "FAILED" ? failure.slice(0, 300) : null } } });
  if (outcome === "FAILED") redirect(`/admin/settings?error=${encodeURIComponent(failure)}`);
  redirect(`/admin/settings?success=test-email&message=${encodeURIComponent(`Test email sent successfully to ${parsed.data.email}.`)}`);
}
