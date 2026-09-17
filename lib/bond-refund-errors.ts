const BOND_REFUND_USER_MESSAGES: Readonly<Record<string, string>> = {
  "Refund amount must be greater than zero.": "Refund amount must be greater than zero.",
  "Choose a valid refund date.": "Choose a valid refund date.",
  "Refundable bond not found.": "This bond is no longer available for refund. Reload the page and select an open bond.",
  "This bond is already closed.": "This bond is already closed and cannot be refunded again.",
  "Refund cannot exceed the remaining bond balance.": "Refund amount exceeds the remaining bond balance. Enter an amount up to the available balance shown for the bond.",
};

export function bondRefundUserMessage(error: unknown) {
  if (!(error instanceof Error)) return null;
  return BOND_REFUND_USER_MESSAGES[error.message] ?? null;
}
