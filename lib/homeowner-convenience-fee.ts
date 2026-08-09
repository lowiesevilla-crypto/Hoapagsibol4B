export const HOMEOWNER_PLATFORM_FEE_ENABLED_KEY = "HOMEOWNER_PLATFORM_FEE_ENABLED";
export const HOMEOWNER_PLATFORM_FEE_AMOUNT_CENTAVOS_KEY = "HOMEOWNER_PLATFORM_FEE_AMOUNT_CENTAVOS";
export const HOMEOWNER_PLATFORM_FEE_LABEL = "HOAHub online convenience fee";
export const PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ENV = "PAYMONGO_HOMEOWNER_PARENT_ACCOUNT_ID";

export const MAX_HOMEOWNER_PLATFORM_FEE_CENTAVOS = 1_000_000; // PHP 10,000.00

export function settingEnabled(value: string | null | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function normalizePlatformFeeCentavos(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value || "0").trim(), 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, MAX_HOMEOWNER_PLATFORM_FEE_CENTAVOS);
}

export function parsePlatformFeePesos(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error("Enter the HOAHub convenience fee as a valid peso amount with up to two decimal places.");
  }
  const centavos = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > MAX_HOMEOWNER_PLATFORM_FEE_CENTAVOS) {
    throw new Error("HOAHub convenience fee must be greater than PHP 0.00 and no more than PHP 10,000.00.");
  }
  return centavos;
}

export function centavosToPesos(centavos: number) {
  return (centavos / 100).toFixed(2);
}

export function checkoutAmounts(principalPesos: number, platformFeeCentavos: number) {
  const principalCentavos = Math.round(principalPesos * 100);
  if (!Number.isSafeInteger(principalCentavos) || principalCentavos <= 0) {
    throw new Error("Payment amount is invalid.");
  }
  const feeCentavos = normalizePlatformFeeCentavos(String(platformFeeCentavos));
  return {
    principalCentavos,
    platformFeeCentavos: feeCentavos,
    baseChargeCentavos: principalCentavos + feeCentavos,
  };
}

export function parseCheckoutFeeMetadata(metadata: unknown) {
  const values = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const principalCentavos = Number.parseInt(String(values.principalAmountCentavos || "0"), 10);
  const platformFeeCentavos = Number.parseInt(String(values.platformFeeCentavos || "0"), 10);
  const passOnFees = String(values.passOnProcessingFees || "").toLowerCase() === "true";
  return {
    principalCentavos: Number.isSafeInteger(principalCentavos) && principalCentavos > 0 ? principalCentavos : 0,
    platformFeeCentavos: Number.isSafeInteger(platformFeeCentavos) && platformFeeCentavos >= 0 ? platformFeeCentavos : 0,
    passOnFees,
  };
}
