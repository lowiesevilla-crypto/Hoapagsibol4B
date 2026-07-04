"use server";

import { FacebookPostStatus, NotificationType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { resolveContentImage } from "@/lib/content-images";
import { prisma } from "@/lib/db";
import { announcementSchema, eventSchema } from "@/lib/validation";
import { queueMessengerPlaceholder, sendEmailNotification } from "@/lib/services/notifications";
import { announcementFacebookMessage, eventFacebookMessage, publishToFacebookPage } from "@/lib/services/facebook";
import { getPaymentSettings } from "@/lib/system-settings";

export async function saveAnnouncementAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = announcementSchema.safeParse({ ...Object.fromEntries(formData.entries()), sendEmail: formData.get("sendEmail") === "on", postToFacebook: formData.get("postToFacebook") === "on", removeImage: formData.get("removeImage") === "on" });
  if (!parsed.success) redirect(contentErrorRedirect("/admin/announcements", parsed.error.issues[0]?.message || "Invalid announcement."));
  const data = parsed.data;
  let announcementId = data.id ?? "";
  let uploadWarning = "";
  try {
    if (data.id) {
      const existing = await prisma.announcement.findUnique({ where: { id: data.id }, select: { id: true } });
      if (!existing) throw new Error("Announcement not found.");
    }
    const image = await resolveContentImage(formData, admin.tenant.slug, data.existingImageUrl, data.removeImage);
    uploadWarning = image.warning ?? "";
    const announcement = data.id
      ? await prisma.announcement.update({ where: { id: data.id }, data: { title: data.title, content: data.content, type: data.type, status: data.status, imageUrl: image.url, sendEmail: data.sendEmail, postToFacebook: data.postToFacebook, facebookStatus: data.postToFacebook ? undefined : FacebookPostStatus.NOT_REQUESTED } })
      : await prisma.announcement.create({ data: { title: data.title, content: data.content, type: data.type, status: data.status, imageUrl: image.url, sendEmail: data.sendEmail, postToFacebook: data.postToFacebook, facebookStatus: data.postToFacebook && data.status === "PUBLISHED" ? FacebookPostStatus.QUEUED : FacebookPostStatus.NOT_REQUESTED, createdById: admin.id } });
    announcementId = announcement.id;
    await writeAuditLog({ actorId: admin.id, module: "CONTENT", action: data.id ? "UPDATE_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT", entityType: "Announcement", entityId: announcement.id, metadata: { status: announcement.status, imageUrl: announcement.imageUrl, uploadWarning: image.warning } });

    if (data.sendEmail && !data.id && data.status === "PUBLISHED") {
      const recipients = await prisma.user.findMany({ where: { role: Role.HOMEOWNER, homeownerProfile: { status: "ACTIVE" } } });
      await Promise.all(recipients.map((recipient) => sendEmailNotification({ recipientId: recipient.id, email: recipient.email, subject: announcement.title, message: announcement.content, type: NotificationType.ANNOUNCEMENT })));
    }
    if (data.postToFacebook && !data.id && data.status === "PUBLISHED") await updateAnnouncementFacebook(announcement.id, await announcementFacebookMessage(announcement.title, announcement.content));
  } catch (error) {
    redirect(contentErrorRedirect("/admin/announcements", error instanceof Error ? error.message : "Announcement could not be saved."));
  }
  revalidatePath("/admin/announcements");
  revalidatePath("/portal/announcements");
  if (announcementId) revalidatePath(`/portal/announcements/${announcementId}`);
  redirect(`/admin/announcements?success=saved&message=${encodeURIComponent(uploadWarning ? `Announcement saved successfully. ${uploadWarning}` : "Announcement saved successfully.")}`);
}

export async function deleteAnnouncementAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  if (!id) redirect(contentErrorRedirect("/admin/announcements", "Announcement not found."));
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) redirect(contentErrorRedirect("/admin/announcements", "Announcement not found."));
  await prisma.announcement.delete({ where: { id } });
  await writeAuditLog({ actorId: admin.id, module: "CONTENT", action: "DELETE_ANNOUNCEMENT", entityType: "Announcement", entityId: id, metadata: existing });
  revalidatePath("/admin/announcements");
  revalidatePath("/portal/announcements");
  redirect("/admin/announcements?success=deleted&message=Announcement%20deleted%20successfully.");
}

export async function saveEventAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const parsed = eventSchema.safeParse({ ...Object.fromEntries(formData.entries()), postToFacebook: formData.get("postToFacebook") === "on", removeImage: formData.get("removeImage") === "on" });
  if (!parsed.success) redirect(contentErrorRedirect("/admin/events", parsed.error.issues[0]?.message || "Invalid event."));
  const data = parsed.data;
  let eventId = data.id ?? "";
  let uploadWarning = "";
  try {
    if (data.id) {
      const existing = await prisma.event.findUnique({ where: { id: data.id }, select: { id: true } });
      if (!existing) throw new Error("Event not found.");
    }
    const image = await resolveContentImage(formData, admin.tenant.slug, data.existingImageUrl, data.removeImage);
    uploadWarning = image.warning ?? "";
    const eventTime = `${data.startTime} - ${data.endTime}`;
    const values = { title: data.title, description: data.description, type: data.type, status: data.status, eventDate: new Date(`${data.eventDate}T00:00:00.000Z`), eventTime, startTime: data.startTime, endTime: data.endTime, location: data.location, imageUrl: image.url, postToFacebook: data.postToFacebook };
    const event = data.id ? await prisma.event.update({ where: { id: data.id }, data: values }) : await prisma.event.create({ data: { ...values, facebookStatus: data.postToFacebook && data.status === "PUBLISHED" ? FacebookPostStatus.QUEUED : FacebookPostStatus.NOT_REQUESTED, createdById: admin.id } });
    eventId = event.id;
    await writeAuditLog({ actorId: admin.id, module: "CONTENT", action: data.id ? "UPDATE_EVENT" : "CREATE_EVENT", entityType: "Event", entityId: event.id, metadata: { status: event.status, imageUrl: event.imageUrl, uploadWarning: image.warning } });
    if (data.postToFacebook && !data.id && data.status === "PUBLISHED") await updateEventFacebook(event.id, await eventFacebookMessage(event));
  } catch (error) {
    redirect(contentErrorRedirect("/admin/events", error instanceof Error ? error.message : "Event could not be saved."));
  }
  revalidatePath("/admin/events");
  revalidatePath("/portal/events");
  if (eventId) revalidatePath(`/portal/events/${eventId}`);
  redirect(`/admin/events?success=saved&message=${encodeURIComponent(uploadWarning ? `Event saved successfully. ${uploadWarning}` : "Event saved successfully.")}`);
}

export async function deleteEventAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) redirect(contentErrorRedirect("/admin/events", "Event not found."));
  await prisma.event.delete({ where: { id } });
  await writeAuditLog({ actorId: admin.id, module: "CONTENT", action: "DELETE_EVENT", entityType: "Event", entityId: id, metadata: existing });
  revalidatePath("/admin/events");
  revalidatePath("/portal/events");
  redirect("/admin/events?success=deleted");
}

export async function setAnnouncementStatusAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) redirect(contentErrorRedirect("/admin/announcements", "Invalid announcement status."));
  if (!id) redirect(contentErrorRedirect("/admin/announcements", "Announcement not found."));
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) redirect(contentErrorRedirect("/admin/announcements", "Announcement not found."));
  await prisma.announcement.update({ where: { id }, data: { status } });
  await writeAuditLog({ actorId: admin.id, module: "CONTENT", action: `${status}_ANNOUNCEMENT`, entityType: "Announcement", entityId: id });
  revalidatePath("/admin/announcements");
  revalidatePath("/portal/announcements");
  revalidatePath(`/portal/announcements/${id}`);
  redirect(`/admin/announcements?success=saved&message=${encodeURIComponent(`Announcement marked ${status.toLowerCase()}.`)}`);
}

export async function setEventStatusAction(formData: FormData) {
  const admin = await requireUser(Role.ADMIN);
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) throw new Error("Invalid event status.");
  await prisma.event.update({ where: { id }, data: { status } });
  await writeAuditLog({ actorId: admin.id, module: "CONTENT", action: `${status}_EVENT`, entityType: "Event", entityId: id });
  revalidatePath("/admin/events");
  revalidatePath("/portal/events");
  redirect(`/admin/events?success=saved&message=${encodeURIComponent(`Event marked ${status.toLowerCase()}.`)}`);
}

export async function sendRemindersAction() {
  await requireUser(Role.ADMIN);
  const paymentSettings = await getPaymentSettings();
  const bills = await prisma.bill.findMany({
    where: { archivedAt: null, balance: { gt: 0 }, status: { in: ["UNPAID", "PARTIAL", "OVERDUE"] }, homeowner: { status: "ACTIVE" } },
    include: { homeowner: { include: { user: true } } },
  });
  await Promise.all(bills.flatMap((bill) => {
    const subject = `HOA dues reminder - ${bill.billingMonth.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`;
    const message = `Hello ${bill.homeowner.user.name},\n\nYour HOA balance is PHP ${Number(bill.balance).toFixed(2)}, due ${bill.dueDate.toLocaleDateString("en-PH")}.\n\n${paymentSettings.paymentInstructions || process.env.PAYMENT_INSTRUCTIONS || "Please contact the HOA office for payment instructions."}`;
    return [
      sendEmailNotification({ recipientId: bill.homeowner.userId, email: bill.homeowner.user.email, subject, message, type: NotificationType.BILL_REMINDER }),
      queueMessengerPlaceholder({ recipientId: bill.homeowner.userId, subject, message, type: NotificationType.BILL_REMINDER }),
    ];
  }));
  revalidatePath("/admin/billing");
  redirect(`/admin/billing?success=reminded&message=${encodeURIComponent(`Reminder processing completed for ${bills.length} outstanding bill(s).`)}`);
}

export async function publishAnnouncementToFacebookAction(formData: FormData) {
  await requireUser(Role.ADMIN);
  const announcement = await prisma.announcement.findUnique({ where: { id: String(formData.get("id") || "") } });
  if (!announcement) redirect(contentErrorRedirect("/admin/announcements", "Announcement not found."));
  const result = await updateAnnouncementFacebook(announcement.id, await announcementFacebookMessage(announcement.title, announcement.content));
  revalidatePath("/admin/announcements");
  redirect(facebookRedirect("/admin/announcements", result.status, result.error, "Announcement posted to the HOA Facebook Page."));
}

export async function publishEventToFacebookAction(formData: FormData) {
  await requireUser(Role.ADMIN);
  const event = await prisma.event.findUnique({ where: { id: String(formData.get("id") || "") } });
  if (!event) throw new Error("Event not found.");
  const result = await updateEventFacebook(event.id, await eventFacebookMessage(event));
  revalidatePath("/admin/events");
  redirect(facebookRedirect("/admin/events", result.status, result.error, "Event posted to the HOA Facebook Page."));
}

async function updateAnnouncementFacebook(id: string, message: string) {
  await prisma.announcement.update({ where: { id }, data: { postToFacebook: true, facebookStatus: FacebookPostStatus.QUEUED, facebookError: null } });
  const result = await publishToFacebookPage(message);
  await prisma.announcement.update({ where: { id }, data: { facebookStatus: result.status, facebookPostId: result.postId ?? null, facebookPublishedAt: result.publishedAt ?? null, facebookError: result.error ?? null } });
  return result;
}

async function updateEventFacebook(id: string, message: string) {
  await prisma.event.update({ where: { id }, data: { postToFacebook: true, facebookStatus: FacebookPostStatus.QUEUED, facebookError: null } });
  const result = await publishToFacebookPage(message);
  await prisma.event.update({ where: { id }, data: { facebookStatus: result.status, facebookPostId: result.postId ?? null, facebookPublishedAt: result.publishedAt ?? null, facebookError: result.error ?? null } });
  return result;
}

function facebookRedirect(path: string, status: FacebookPostStatus, error: string | undefined, successMessage: string) {
  return status === FacebookPostStatus.SENT ? `${path}?success=published&message=${encodeURIComponent(successMessage)}` : `${path}?error=${encodeURIComponent(error || "Facebook Page posting was not completed.")}`;
}

function contentErrorRedirect(path: string, message: string) {
  return `${path}?error=${encodeURIComponent(message)}`;
}
