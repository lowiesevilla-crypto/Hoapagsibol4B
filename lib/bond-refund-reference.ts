export function bondRefundReference(refundId: string, refundDate: Date) {
  return `RF-BR-${refundDate.getUTCFullYear()}-${refundId.slice(-8).toUpperCase()}`;
}
