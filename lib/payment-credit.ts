type AllocationAmount = { amount: unknown };

type PaymentAmountSource = {
  amount: unknown;
  billId?: unknown;
  allocations?: AllocationAmount[];
};

export function paymentAppliedAmount(payment: PaymentAmountSource) {
  if (payment.allocations?.length) return roundMoney(payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0));
  const explicitlyUnlinked = Object.prototype.hasOwnProperty.call(payment, "billId") && !payment.billId;
  return explicitlyUnlinked ? 0 : roundMoney(Number(payment.amount));
}

export function paymentUnappliedCredit(payment: PaymentAmountSource) {
  return roundMoney(Math.max(0, Number(payment.amount) - paymentAppliedAmount(payment)));
}

export function totalUnappliedCredit(payments: PaymentAmountSource[]) {
  return roundMoney(payments.reduce((sum, payment) => sum + paymentUnappliedCredit(payment), 0));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
