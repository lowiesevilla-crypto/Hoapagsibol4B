"use server";

import {
  BillingFrequency,
  PlatformPaymentMethod,
  Role,
  TenantModule,
  TenantSuspensionReason,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  assignTenantSubscription,
  generatePlatformInvoice,
  recordPlatformManualPayment,
  reinstateTenantCommercially,
  saveTenantBillingProfile,
  suspendTenantCommercially,
} from "@/lib/services/platform-billing";
import { sendPlatformInvoiceEmail } from "@/lib/services/platform-invoice-email";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function numberValue(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function requirePlatformBillingUser() {
  const user = await requireUser();
  if (!user.roles.includes(Role.SUPER_ADMIN) && !user.roles.includes(Role.PLATFORM_ADMIN)) redirect("/admin/dashboard");
  return user;
}

export async function createSubscriptionPlanAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const code = clean(formData.get("code")).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  const name = clean(formData.get("name"));
  if (!code || !name) redirect("/platform/plans?error=Plan%20code%20and%20name%20are%20required.");
  const monthlyPrice = clean(formData.get("monthlyPrice"));
  const annualPrice = clean(formData.get("annualPrice"));
  const modules = new Set(formData.getAll("modules").map(String));
  try {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code,
        name,
        description: clean(formData.get("description")) || null,
        currency: clean(formData.get("currency")) || "PHP",
        monthlyPrice: monthlyPrice ? numberValue(formData.get("monthlyPrice")) : null,
        annualPrice: annualPrice ? numberValue(formData.get("annualPrice")) : null,
        setupFee: numberValue(formData.get("setupFee")),
        trialDays: Math.max(0, Math.min(365, numberValue(formData.get("trialDays"), 14))),
        maximumUsers: clean(formData.get("maximumUsers")) ? numberValue(formData.get("maximumUsers")) : null,
        maximumHomeowners: clean(formData.get("maximumHomeowners")) ? numberValue(formData.get("maximumHomeowners")) : null,
        maximumStorageMb: clean(formData.get("maximumStorageMb")) ? numberValue(formData.get("maximumStorageMb")) : null,
        modules: { create: Object.values(TenantModule).filter((module) => modules.has(module)).map((module) => ({ module, enabled: true })) },
      },
    });
    await prisma.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, module: "PLATFORM_BILLING", action: "PLAN_CREATED", entityType: "SubscriptionPlan", entityId: plan.id, metadata: { code: plan.code, name: plan.name } } });
  } catch {
    redirect("/platform/plans?error=The%20plan%20could%20not%20be%20created.%20Check%20the%20code%20and%20pricing.");
  }
  revalidatePath("/platform/plans");
  redirect("/platform/plans?success=Plan%20created.");
}

export async function toggleSubscriptionPlanAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const planId = clean(formData.get("planId"));
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) redirect("/platform/plans?error=Plan%20not%20found.");
  await prisma.$transaction([
    prisma.subscriptionPlan.update({ where: { id: plan.id }, data: { active: !plan.active } }),
    prisma.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, module: "PLATFORM_BILLING", action: plan.active ? "PLAN_DEACTIVATED" : "PLAN_ACTIVATED", entityType: "SubscriptionPlan", entityId: plan.id } }),
  ]);
  revalidatePath("/platform/plans");
  redirect("/platform/plans?success=Plan%20status%20updated.");
}

export async function assignTenantSubscriptionAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  const planId = clean(formData.get("planId"));
  const frequency = clean(formData.get("billingFrequency")) as BillingFrequency;
  if (!tenantId || !planId || !Object.values(BillingFrequency).includes(frequency)) redirect(`/platform/tenants/${tenantId}/billing?error=Select%20a%20valid%20plan%20and%20billing%20frequency.`);
  try {
    await assignTenantSubscription({
      tenantId,
      planId,
      billingFrequency: frequency,
      agreedPrice: clean(formData.get("agreedPrice")) ? numberValue(formData.get("agreedPrice")) : null,
      discount: numberValue(formData.get("discount")),
      trialDays: clean(formData.get("trialDays")) ? numberValue(formData.get("trialDays")) : null,
      actorId: actor.id,
    });
  } catch (error) {
    redirect(`/platform/tenants/${tenantId}/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Subscription assignment failed.")}`);
  }
  revalidatePath("/platform/tenants");
  revalidatePath("/platform/subscriptions");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/billing`);
  redirect(`/platform/tenants/${tenantId}/billing?success=Subscription%20assigned.`);
}

export async function saveTenantBillingProfileAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  if (!tenantId) redirect("/platform/tenants?error=Tenant%20not%20found.");
  await saveTenantBillingProfile({
    tenantId,
    legalBusinessName: clean(formData.get("legalBusinessName")),
    billingAddress: clean(formData.get("billingAddress")),
    billingEmail: clean(formData.get("billingEmail")),
    secondaryBillingEmail: clean(formData.get("secondaryBillingEmail")),
    contactPerson: clean(formData.get("contactPerson")),
    contactNumber: clean(formData.get("contactNumber")),
    tinNumber: clean(formData.get("tinNumber")),
    vatStatus: clean(formData.get("vatStatus")),
    invoiceNotes: clean(formData.get("invoiceNotes")),
    paymentTermsDays: Math.max(0, Math.min(365, numberValue(formData.get("paymentTermsDays"), 15))),
    purchaseOrderRequired: formData.get("purchaseOrderRequired") === "on",
    paymentMethodPreference: clean(formData.get("paymentMethodPreference")),
    actorId: actor.id,
  });
  revalidatePath(`/platform/tenants/${tenantId}/billing`);
  redirect(`/platform/tenants/${tenantId}/billing?success=Billing%20profile%20updated.`);
}

export async function generateTenantInvoiceAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  try {
    const invoice = await generatePlatformInvoice({ tenantId, actorId: actor.id });
    const delivery = await sendPlatformInvoiceEmail({ invoiceId: invoice.id, actorId: actor.id });
    revalidatePath("/platform/tenants");
    revalidatePath("/platform/subscriptions");
    revalidatePath(`/platform/tenants/${tenantId}/billing`);
    revalidatePath("/admin/subscription");
    if (delivery.status === "SENT") {
      redirect(`/platform/tenants/${tenantId}/billing?success=${encodeURIComponent(`Invoice ready and emailed to ${delivery.recipients.join(", ")}.`)}`);
    }
    const warning = delivery.message || (delivery.status === "SKIPPED" ? "No billing email is configured." : "Invoice email delivery failed.");
    redirect(`/platform/tenants/${tenantId}/billing?error=${encodeURIComponent(`Invoice is ready, but email was not sent: ${warning}`)}`);
  } catch (error) {
    redirect(`/platform/tenants/${tenantId}/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Invoice generation failed.")}`);
  }
}

export async function recordPlatformManualPaymentAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  const invoiceId = clean(formData.get("invoiceId"));
  const method = clean(formData.get("method")) as PlatformPaymentMethod;
  if (!Object.values(PlatformPaymentMethod).includes(method)) redirect(`/platform/tenants/${tenantId}/billing?error=Select%20a%20valid%20payment%20method.`);
  try {
    await recordPlatformManualPayment({ tenantId, invoiceId, amount: numberValue(formData.get("amount")), method, referenceNumber: clean(formData.get("referenceNumber")), actorId: actor.id });
  } catch (error) {
    redirect(`/platform/tenants/${tenantId}/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Payment recording failed.")}`);
  }
  revalidatePath("/platform/tenants");
  revalidatePath("/platform/subscriptions");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/billing`);
  revalidatePath("/admin/subscription");
  redirect(`/platform/tenants/${tenantId}/billing?success=Payment%20recorded.`);
}

export async function suspendTenantAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  const reason = clean(formData.get("reason")) as TenantSuspensionReason;
  if (!Object.values(TenantSuspensionReason).includes(reason)) redirect(`/platform/tenants/${tenantId}/billing?error=Select%20a%20valid%20suspension%20reason.`);
  await suspendTenantCommercially({ tenantId, reason, notes: clean(formData.get("notes")), autoReinstate: formData.get("autoReinstate") === "on", actorId: actor.id });
  revalidatePath("/platform/tenants");
  revalidatePath("/platform/subscriptions");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/billing`);
  redirect(`/platform/tenants/${tenantId}/billing?success=Tenant%20suspended.`);
}

export async function reinstateTenantAction(formData: FormData) {
  const actor = await requirePlatformBillingUser();
  const tenantId = clean(formData.get("tenantId"));
  try {
    await reinstateTenantCommercially({ tenantId, notes: clean(formData.get("notes")), actorId: actor.id });
  } catch (error) {
    redirect(`/platform/tenants/${tenantId}/billing?error=${encodeURIComponent(error instanceof Error ? error.message : "Tenant reinstatement failed.")}`);
  }
  revalidatePath("/platform/tenants");
  revalidatePath("/platform/subscriptions");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath(`/platform/tenants/${tenantId}/billing`);
  revalidatePath("/admin/subscription");
  redirect(`/platform/tenants/${tenantId}/billing?success=Tenant%20reinstated.`);
}
