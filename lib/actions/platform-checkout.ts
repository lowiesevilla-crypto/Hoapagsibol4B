"use server";

import { redirect } from "next/navigation";
import { createPayMongoInvoiceCheckout, verifyPlatformInvoicePaymentToken } from "@/lib/services/platform-paymongo";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export async function startPayMongoInvoiceCheckoutAction(formData: FormData) {
  const invoiceId = clean(formData.get("invoiceId"));
  const token = clean(formData.get("token"));
  if (!verifyPlatformInvoicePaymentToken(invoiceId, token)) redirect("/login?error=invalid-payment-link");
  try {
    const checkout = await createPayMongoInvoiceCheckout(invoiceId);
    redirect(checkout.checkoutUrl);
  } catch (error) {
    const url = new URL(`/subscription/pay/${encodeURIComponent(invoiceId)}`, process.env.APP_URL || process.env.PUBLIC_APP_URL || "http://localhost:3000");
    url.searchParams.set("token", token);
    url.searchParams.set("error", error instanceof Error ? error.message : "Online checkout is currently unavailable.");
    redirect(url.toString());
  }
}
