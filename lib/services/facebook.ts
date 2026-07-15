import { FacebookPostStatus, SystemSettingCategory } from "@prisma/client";
import { BOOTSTRAP_TENANT_ID, getAssociationSettings, getSystemSettingValue } from "@/lib/system-settings";

export type FacebookPublishResult = {
  status: FacebookPostStatus;
  postId?: string;
  publishedAt?: Date;
  error?: string;
};

export async function publishToFacebookPage(message: string, tenantId: string): Promise<FacebookPublishResult> {
  const bootstrapValue = (key: string) => tenantId === BOOTSTRAP_TENANT_ID ? process.env[key]?.trim() || "" : "";
  const pageId = (await getSystemSettingValue(SystemSettingCategory.FACEBOOK, "FACEBOOK_PAGE_ID", tenantId)) || bootstrapValue("FACEBOOK_PAGE_ID");
  const accessToken = (await getSystemSettingValue(SystemSettingCategory.FACEBOOK, "FACEBOOK_PAGE_ACCESS_TOKEN", tenantId)) || bootstrapValue("FACEBOOK_PAGE_ACCESS_TOKEN");
  const version = (await getSystemSettingValue(SystemSettingCategory.FACEBOOK, "FACEBOOK_GRAPH_API_VERSION", tenantId)) || bootstrapValue("FACEBOOK_GRAPH_API_VERSION") || "v23.0";
  if (!pageId || !accessToken) return { status: FacebookPostStatus.SKIPPED, error: "Facebook Page posting is not configured. Add FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN to the environment." };
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message, access_token: accessToken }),
      cache: "no-store",
    });
    const result = await response.json() as { id?: string; error?: { message?: string } };
    if (!response.ok || !result.id) return { status: FacebookPostStatus.FAILED, error: result.error?.message || `Facebook returned HTTP ${response.status}.` };
    return { status: FacebookPostStatus.SENT, postId: result.id, publishedAt: new Date() };
  } catch (error) {
    return { status: FacebookPostStatus.FAILED, error: error instanceof Error ? error.message : "Unable to reach Facebook." };
  }
}

export async function announcementFacebookMessage(title: string, content: string, tenantId: string) {
  const association = await getAssociationSettings(tenantId);
  return `${title}\n\n${content}\n\n${association.name} Homeowners Association`;
}

export async function eventFacebookMessage(event: { title: string; description: string; eventDate: Date; eventTime: string; location: string }, tenantId: string) {
  const association = await getAssociationSettings(tenantId);
  return `${event.title}\n\n${event.description}\n\nDate: ${event.eventDate.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}\nTime: ${event.eventTime}\nLocation: ${event.location}\n\n${association.name} Homeowners Association`;
}
