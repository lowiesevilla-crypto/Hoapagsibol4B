export const PAYMONGO_RECEIPT_DETAILS_ACTION = "PAYMONGO_HOMEOWNER_RECEIPT_DETAILS";

export type PayMongoReceiptDetails = {
  gatewayPaymentId: string | null;
  sourceType: string | null;
  paymentChannel: string | null;
  paidAt: Date | null;
};

export function extractPayMongoReceiptDetails(rawBody: string): PayMongoReceiptDetails | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const root = objectValue(payload);
  const data = objectValue(root?.data);
  const attributes = objectValue(data?.attributes);
  const modernType = typeof data?.type === "string" && data.type.includes(".");
  const session = objectValue((modernType ? data?.data : attributes?.data) ?? null);
  const sessionAttributes = objectValue(session?.attributes);
  const payments = Array.isArray(sessionAttributes?.payments)
    ? sessionAttributes.payments.map(objectValue).filter((value): value is Record<string, unknown> => Boolean(value))
    : [];
  const paidPayment = payments.find((item) => String(objectValue(item.attributes)?.status || "").toLowerCase() === "paid") || payments[0];
  if (!paidPayment) return null;

  const paymentAttributes = objectValue(paidPayment.attributes);
  const source = objectValue(paymentAttributes?.source);
  const sourceType = stringValue(source?.type)?.toLowerCase() || null;
  const paidAtSeconds = Number(paymentAttributes?.paid_at || 0);
  const paidAt = Number.isFinite(paidAtSeconds) && paidAtSeconds > 0 ? new Date(paidAtSeconds * 1000) : null;

  return {
    gatewayPaymentId: stringValue(paidPayment.id),
    sourceType,
    paymentChannel: payMongoChannelLabel(sourceType),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
  };
}

export function payMongoChannelLabel(sourceType?: string | null) {
  switch (sourceType?.trim().toLowerCase()) {
    case "gcash": return "GCash";
    case "qrph": return "QR PH";
    case "paymaya":
    case "maya": return "Maya";
    case "card": return "Card";
    case "bank_transfer":
    case "bank": return "Bank Transfer";
    default: return null;
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
